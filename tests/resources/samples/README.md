# Sample images

Images from [enslo/sd-metadata](https://github.com/enslo/sd-metadata/tree/main/samples) (MIT License, Copyright (c) 2026 Rikuto Nakao), produced by the generators they are named after.

The pixels were replaced with a 1x1 placeholder by `scripts/shrink-sample.mjs`, which keeps every metadata chunk, segment and EXIF block byte for byte.

The videos (`mp4`, `mov`, `webm`, `mkv`, `vendor/mp4`) had their media data removed by `scripts/shrink-video.mjs`, which keeps every metadata box and element byte for byte. They no longer play.
