export interface StructuredErrorDetails {
    error: string;
    errorType?: string;
    traceback?: string;
}

export class StructuredError extends Error {
    public readonly errorType?: string;
    public readonly traceback?: string;

    public constructor(details: StructuredErrorDetails) {
        super(details.error);
        this.name = 'StructuredError';
        this.errorType = details.errorType;
        this.traceback = details.traceback;
    }

    public toJSON(): StructuredErrorDetails {
        return {
            error: this.message,
            errorType: this.errorType,
            traceback: this.traceback
        };
    }
}
