"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParserManager = void 0;
const sharp_1 = __importDefault(require("sharp"));
const promises_1 = require("fs/promises");
const exceptions_1 = require("./exceptions");
const extractors_1 = require("./extractors");
const parsers_1 = require("./parsers");
/**
 * Provides a simple way of testing multiple parser modules against a given image
 */
class ParserManager {
    constructor(options = {}) {
        const { debug = false, eagerness = extractors_1.Eagerness.DEFAULT, managedParsers, normalizeParameters = true } = options;
        this.eagerness = eagerness;
        this.debug = debug;
        const parsersToUse = managedParsers || parsers_1.MANAGED_PARSERS;
        this.managedParsers = parsersToUse.map(ParserClass => new ParserClass(normalizeParameters, debug));
    }
    /**
     * Try to extract image generation parameters from the given image.
     */
    async parse(input, eagerness) {
        const targetEagerness = eagerness || this.eagerness;
        let image;
        // Convert input to Sharp instance
        if (typeof input === 'string') {
            // File path
            try {
                const buffer = await (0, promises_1.readFile)(input);
                image = (0, sharp_1.default)(buffer);
            }
            catch (error) {
                throw new Error(`Failed to read image file: ${error}`);
            }
        }
        else if (Buffer.isBuffer(input)) {
            // Buffer
            image = (0, sharp_1.default)(input);
        }
        else {
            // Already a Sharp instance
            image = input;
        }
        // Get image metadata to determine format
        const metadata = await image.metadata();
        const format = metadata.format?.toUpperCase();
        if (!format) {
            if (this.debug) {
                console.log('Unknown image format');
            }
            return null;
        }
        // Get extractors for this format
        const extractors = extractors_1.METADATA_EXTRACTORS[format];
        if (!extractors) {
            if (this.debug) {
                console.log(`Unsupported image format: ${format}`);
            }
            return null;
        }
        // Try extractors in order of eagerness
        for (const eagernessLevel of [extractors_1.Eagerness.FAST, extractors_1.Eagerness.DEFAULT, extractors_1.Eagerness.EAGER]) {
            if (eagernessLevel > targetEagerness) {
                break;
            }
            const levelExtractors = extractors[eagernessLevel];
            if (!levelExtractors) {
                continue;
            }
            for (const extractor of levelExtractors) {
                for (const parser of this.managedParsers) {
                    try {
                        const parameters = await extractor(image, parser.generator);
                        if (!parameters) {
                            continue;
                        }
                        try {
                            return await parser.parse(parameters);
                        }
                        catch (error) {
                            if (error instanceof exceptions_1.ParserError) {
                                if (this.debug) {
                                    console.error(`Error in parser[${parser.constructor.name}]: ${error.message}`);
                                }
                            }
                            else {
                                throw error;
                            }
                        }
                    }
                    catch (error) {
                        if (error instanceof exceptions_1.MetadataError) {
                            if (this.debug) {
                                console.error('Error reading metadata:', error.message);
                            }
                            break; // Break from parser loop, try next extractor
                        }
                        else {
                            throw error;
                        }
                    }
                }
            }
        }
        return null;
    }
}
exports.ParserManager = ParserManager;
//# sourceMappingURL=parserManager.js.map