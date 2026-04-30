export interface FileTextReader {
  read(path: string): Promise<string>;
}
