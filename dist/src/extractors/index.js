"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Eagerness = exports.METADATA_EXTRACTORS = void 0;
const eagerness_1 = require("./eagerness");
const extractors_1 = require("./extractors");
/**
 * Metadata extractors organized by image format and eagerness level
 */
exports.METADATA_EXTRACTORS = {
    PNG: {
        [eagerness_1.Eagerness.FAST]: [extractors_1.pngImageInfo],
        [eagerness_1.Eagerness.DEFAULT]: [extractors_1.pngImageText],
        [eagerness_1.Eagerness.EAGER]: [extractors_1.pngStenographicAlpha],
    },
    JPEG: {
        [eagerness_1.Eagerness.FAST]: [extractors_1.jpegUserComment],
        [eagerness_1.Eagerness.DEFAULT]: [],
        [eagerness_1.Eagerness.EAGER]: [],
    },
    WEBP: {
        [eagerness_1.Eagerness.FAST]: [extractors_1.jpegUserComment],
        [eagerness_1.Eagerness.DEFAULT]: [],
        [eagerness_1.Eagerness.EAGER]: [],
    },
};
var eagerness_2 = require("./eagerness");
Object.defineProperty(exports, "Eagerness", { enumerable: true, get: function () { return eagerness_2.Eagerness; } });
//# sourceMappingURL=index.js.map