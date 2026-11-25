"""C2PA manifests (Content Credentials) stored as JUMBF boxes."""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from .._util import js_str, latin1, utf8_lenient
from ..extractors.image import detect_format
from ..video import read_video_metadata
from .cbor import CborTagged, decode_cbor


@dataclass
class JumbfBox:
    """A JUMBF superbox: its label and the boxes inside it"""

    label: Optional[str]
    #: Content type UUID of the description box, as hex
    content_type: str
    #: Content boxes (`cbor`, `json`, `bidb`, ...) as (type, data)
    content: List[Tuple[str, bytes]] = field(default_factory=list)
    children: List["JumbfBox"] = field(default_factory=list)


def _read_boxes(data: bytes) -> List[Tuple[str, bytes]]:
    boxes: List[Tuple[str, bytes]] = []
    offset = 0
    while offset + 8 <= len(data):
        size = struct.unpack_from(">I", data, offset)[0]
        type_ = latin1(data[offset + 4 : offset + 8])
        header = 8
        if size == 1:
            if offset + 16 > len(data):
                break
            size = struct.unpack_from(">Q", data, offset + 8)[0]
            header = 16
        elif size == 0:
            size = len(data) - offset
        if size < header or offset + size > len(data):
            break
        boxes.append((type_, data[offset + header : offset + size]))
        offset += size
    return boxes


def _read_superbox(data: bytes) -> Optional[JumbfBox]:
    boxes = _read_boxes(data)
    if not boxes:
        return None
    description, rest = boxes[0], boxes[1:]
    if description[0] != "jumd" or len(description[1]) < 17:
        return None
    jumd = description[1]
    content_type = jumd[:16].hex()
    toggles = jumd[16]
    label = None
    if toggles & 0x02:
        end = jumd.find(b"\x00", 17)
        label = utf8_lenient(jumd[17 : len(jumd) if end == -1 else end])

    box = JumbfBox(label, content_type)
    for type_, child in rest:
        if type_ == "jumb":
            superbox = _read_superbox(child)
            if superbox:
                box.children.append(superbox)
        else:
            box.content.append((type_, child))
    return box


def read_jumbf(data: bytes) -> Optional[JumbfBox]:
    """Read a JUMBF superbox (`jumb`) and the superboxes nested in it"""
    boxes = _read_boxes(bytes(data))
    if boxes and boxes[0][0] == "jumb":
        return _read_superbox(boxes[0][1])
    return None


def _read_jpeg_c2pa(data: bytes) -> Optional[bytes]:
    # APP11 segments: "JP", box instance number, sequence number, then the box, whose header is
    # repeated in every segment after the first
    parts: Dict[int, List[Tuple[int, bytes]]] = {}
    offset = 2
    while offset + 4 <= len(data) and data[offset] == 0xFF:
        marker = data[offset + 1]
        if marker in (0xDA, 0xD9):
            break
        length = struct.unpack_from(">H", data, offset + 2)[0]
        segment = data[offset + 4 : min(offset + 2 + length, len(data))]
        if marker == 0xEB and len(segment) > 16 and segment[0] == 0x4A and segment[1] == 0x50:
            instance = (segment[2] << 8) | segment[3]
            sequence = struct.unpack_from(">I", segment, 4)[0]
            parts.setdefault(instance, []).append((sequence, segment[8:]))
        offset += 2 + length

    for items in parts.values():
        items.sort(key=lambda item: item[0])
        first = items[0][1]
        if first[4:8] != b"jumb":
            continue
        header = 16 if struct.unpack_from(">I", first, 0)[0] == 1 else 8
        return first + b"".join(item[1][header:] for item in items[1:])
    return None


def _find_chunk(data: bytes, start: int, little_endian: bool, wanted: str, size_extra: int, pad: bool) -> Optional[bytes]:
    offset = start
    while offset + 8 <= len(data):
        if little_endian:
            size = struct.unpack_from("<I", data, offset + 4)[0]
            type_ = latin1(data[offset : offset + 4])
        else:
            size = struct.unpack_from(">I", data, offset)[0]
            type_ = latin1(data[offset + 4 : offset + 8])
        if type_ == wanted:
            return data[offset + 8 : min(offset + 8 + size, len(data))]
        if type_ == "IEND":
            break
        offset += 8 + size + size_extra + (size % 2 if pad else 0)
    return None


def extract_c2pa(data: bytes) -> Optional[bytes]:
    """Find the C2PA manifest store (JUMBF) of a PNG (`caBX` chunk), JPEG (APP11 segments),
    WEBP (`C2PA` chunk) or MP4 / MOV (`uuid` box) file"""
    data = bytes(data)
    format_ = detect_format(data)
    if format_ == "PNG":
        return _find_chunk(data, 8, False, "caBX", 4, False)
    if format_ == "JPEG":
        return _read_jpeg_c2pa(data)
    if format_ == "WEBP":
        return _find_chunk(data, 12, True, "C2PA", 0, True)
    video = read_video_metadata(data)
    return video.c2pa if video else None


@dataclass
class C2paAction:
    action: str
    when: Optional[str] = None
    software_agent: Optional[str] = None
    digital_source_type: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {"action": self.action}
        if self.when is not None:
            result["when"] = self.when
        if self.software_agent is not None:
            result["softwareAgent"] = self.software_agent
        if self.digital_source_type is not None:
            result["digitalSourceType"] = self.digital_source_type
        return result


@dataclass
class C2paManifest:
    label: Optional[str] = None
    #: Name (and version) of the tool that made the claim
    claim_generator: Optional[str] = None
    title: Optional[str] = None
    actions: List[C2paAction] = field(default_factory=list)
    #: Organization names in the signing certificates, signer first
    signers: List[str] = field(default_factory=list)
    #: Decoded assertions by label
    assertions: Dict[str, Any] = field(default_factory=dict)

    def summary(self) -> Dict[str, Any]:
        """The manifest with the labels of its assertions instead of their contents"""
        result: Dict[str, Any] = {}
        if self.label is not None:
            result["label"] = self.label
        result["actions"] = [action.to_dict() for action in self.actions]
        result["signers"] = list(self.signers)
        if self.claim_generator is not None:
            result["claimGenerator"] = self.claim_generator
        if self.title is not None:
            result["title"] = self.title
        result["assertions"] = list(self.assertions.keys())
        return result


@dataclass
class C2paManifestStore:
    #: All manifests, oldest first
    manifests: List[C2paManifest]

    @property
    def active_manifest(self) -> Optional[C2paManifest]:
        """The manifest that describes the file as it is: the last one in the store"""
        return self.manifests[-1] if self.manifests else None


def _decode_content(box: JumbfBox) -> Any:
    for type_, data in box.content:
        try:
            if type_ == "cbor":
                return decode_cbor(data)
            if type_ == "json":
                return json.loads(utf8_lenient(data))
        except Exception:
            return None
    return None


def _str(value: Any) -> Optional[str]:
    return value if isinstance(value, str) and value else None


def _agent_name(value: Any) -> Optional[str]:
    if isinstance(value, str):
        return value or None
    if isinstance(value, dict):
        name = value.get("name")
        version = value.get("version")
        if isinstance(name, str) and name:
            return f"{name} {version}" if isinstance(version, str) and version else name
    return None


def _organization_names(der: bytes) -> List[str]:
    """Organization names (OID 2.5.4.10) in DER encoded certificates, in order of appearance"""
    names: List[str] = []
    i = 0
    while i + 7 < len(der):
        if der[i : i + 5] == b"\x06\x03\x55\x04\x0a":
            length = der[i + 6]
            if length < 0x80 and i + 7 + length <= len(der):
                name = utf8_lenient(der[i + 7 : i + 7 + length])
                if name not in names:
                    names.append(name)
        i += 1
    return names


def _signer_names(signature: Any) -> List[str]:
    """The leaf certificate comes first, and its issuer before its subject"""
    certificates: List[bytes] = []

    def collect(value: Any) -> None:
        if isinstance(value, bytes):
            certificates.append(value)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif isinstance(value, CborTagged):
            collect(value.value)
        elif isinstance(value, dict):
            if "tag" in value:
                collect(value.get("value"))
            else:
                for key, entry in value.items():
                    if key in ("33", "x5chain"):
                        collect(entry)

    # COSE_Sign1: [protected header, unprotected header, payload, signature]
    cose = signature.value if isinstance(signature, CborTagged) else signature
    if isinstance(cose, list):
        if cose and isinstance(cose[0], bytes):
            try:
                collect(decode_cbor(cose[0]))
            except Exception:
                pass
        collect(cose[1] if len(cose) > 1 else None)
    if not certificates:
        return []
    leaf, chain = certificates[0], certificates[1:]
    leaf_names = _organization_names(leaf)
    subject = leaf_names[-1] if leaf_names else None
    others = [name for name in leaf_names + [n for cert in chain for n in _organization_names(cert)] if name != subject]
    unique: List[str] = []
    for name in others:
        if name not in unique:
            unique.append(name)
    return ([subject] if subject else []) + unique


def _read_manifest(box: JumbfBox) -> C2paManifest:
    manifest = C2paManifest(label=box.label)
    for child in box.children:
        label = child.label or ""
        if label == "c2pa.assertions":
            for assertion in child.children:
                if assertion.label:
                    manifest.assertions[assertion.label] = _decode_content(assertion)
        elif label.startswith("c2pa.claim"):
            claim = _decode_content(child)
            if isinstance(claim, dict):
                info = claim.get("claim_generator_info")
                if isinstance(info, list):
                    info = info[0] if info else None
                manifest.claim_generator = _agent_name(info) or _str(claim.get("claim_generator"))
                manifest.title = _str(claim.get("dc:title")) or _str(claim.get("title"))
        elif label == "c2pa.signature":
            manifest.signers = _signer_names(_decode_content(child))

    for label, value in manifest.assertions.items():
        if not label.startswith("c2pa.actions") or not isinstance(value, dict):
            continue
        actions = value.get("actions")
        if not isinstance(actions, list):
            continue
        for entry in actions:
            if not isinstance(entry, dict):
                continue
            parameters = entry.get("parameters")
            manifest.actions.append(
                C2paAction(
                    action=js_str(entry.get("action")) if "action" in entry else "undefined",
                    when=_str(entry.get("when")),
                    software_agent=_agent_name(entry.get("softwareAgent")),
                    digital_source_type=_str(entry.get("digitalSourceType"))
                    or (_str(parameters.get("digitalSourceType")) if isinstance(parameters, dict) else None),
                )
            )
    return manifest


def read_c2pa(data: bytes) -> Optional[C2paManifestStore]:
    """Read the C2PA (Content Credentials) manifests of an image. The signature is not verified:
    this tells what the file claims, not whether the claim is authentic."""
    jumbf = extract_c2pa(data)
    store = read_jumbf(jumbf) if jumbf else None
    if not store or store.label != "c2pa":
        return None
    return C2paManifestStore([_read_manifest(child) for child in store.children])
