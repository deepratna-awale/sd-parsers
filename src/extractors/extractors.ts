import sharp from 'sharp';
import extractChunks from 'png-chunks-extract';
import { Generators } from '../data';
import { MetadataError } from '../exceptions';

/**
 * Type definition for metadata extractor functions
 */
export type ExtractorFunction = (
  image: sharp.Sharp, 
  generator: Generators
) => Promise<Record<string, any> | null>;

/**
 * Extract metadata from PNG image info
 */
export async function pngImageInfo(image: sharp.Sharp, _: Generators): Promise<Record<string, any> | null> {
  try {
    const metadata = await image.metadata();
    
    // Sharp provides some PNG metadata but not the text chunks we need
    // This is a limitation compared to PIL
    const result: Record<string, any> = {};
    
    if (metadata.density) {
      result.dpi = metadata.density;
    }
    
    if (metadata.width) result.width = metadata.width;
    if (metadata.height) result.height = metadata.height;
    
    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    throw new MetadataError(`Error reading PNG metadata: ${error}`);
  }
}

/**
 * Extract metadata from PNG text chunks
 */
export async function pngImageText(image: sharp.Sharp, _: Generators): Promise<Record<string, any> | null> {
  try {
    // Get the PNG buffer from Sharp
    const buffer = await image.png().toBuffer();
    
    // Extract PNG chunks
    const chunks = extractChunks(buffer);
    
    // Look for text chunks
    const textChunks = chunks.filter(chunk => 
      chunk.name === 'tEXt' || 
      chunk.name === 'zTXt' || 
      chunk.name === 'iTXt'
    );
    
    if (textChunks.length === 0) {
      return null;
    }
    
    const result: Record<string, any> = {};
    
    for (const chunk of textChunks) {
      try {
        let text: string;
        let keyword: string;
        
        if (chunk.name === 'tEXt') {
          // Uncompressed text
          const data = chunk.data;
          const nullIndex = data.indexOf(0);
          if (nullIndex === -1) continue;
          
          keyword = Buffer.from(data.subarray(0, nullIndex)).toString('latin1');
          text = Buffer.from(data.subarray(nullIndex + 1)).toString('latin1');
          
        } else if (chunk.name === 'zTXt') {
          // Compressed text (would need zlib)
          continue;
        } else if (chunk.name === 'iTXt') {
          // International text (more complex format)
          continue;
        } else {
          continue;
        }
        
        // Store the text data
        if (keyword && text) {
          result[keyword] = text;
          
          // Common SD metadata keywords
          if (keyword.toLowerCase() === 'parameters') {
            result.parameters = text;
          }
        }
      } catch (error) {
        // Skip problematic chunks
        continue;
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    throw new MetadataError(`Error reading PNG text chunks: ${error}`);
  }
}

/**
 * Extract metadata from PNG stenographic alpha channel
 */
export async function pngStenographicAlpha(image: sharp.Sharp, _: Generators): Promise<Record<string, any> | null> {
  try {
    // This would require specialized stenographic analysis
    // For now, return null as this is a complex feature
    return null;
  } catch (error) {
    throw new MetadataError(`Error reading stenographic alpha: ${error}`);
  }
}

/**
 * Extract metadata from JPEG UserComment EXIF field
 */
export async function jpegUserComment(image: sharp.Sharp, generator: Generators): Promise<Record<string, any> | null> {
  try {
    const metadata = await image.metadata();
    
    if (!metadata.exif) {
      return null;
    }
    
    // For now, return basic EXIF presence info
    // Full EXIF parsing would require additional libraries like exifr
    if (generator === Generators.AUTOMATIC1111 || generator === Generators.FOOOCUS) {
      // Would need to parse UserComment from EXIF buffer
      // This is a placeholder for the actual EXIF parsing logic
      return { parameters: '' }; // Placeholder
    }
    
    return null;
  } catch (error) {
    throw new MetadataError(`Error reading JPEG UserComment: ${error}`);
  }
}
