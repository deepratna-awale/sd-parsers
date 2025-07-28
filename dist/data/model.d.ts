/**
 * Represents a checkpoint model used during image generation
 */
export interface Model {
    /** Name of the checkpoint model (if found) */
    name?: string;
    /** Hash value of the checkpoint model (if found) */
    hash?: string;
    /** Model id */
    modelId?: string;
    /** Additional generator-specific information. Highly dependent on the respective image generator. */
    metadata: Record<string, any>;
}
/**
 * Creates a new Model instance
 */
export declare function createModel(options: Partial<Model> & {
    name?: string;
    hash?: string;
}): Model;
/**
 * Returns string representation of the model
 */
export declare function modelToString(model: Model): string;
//# sourceMappingURL=model.d.ts.map