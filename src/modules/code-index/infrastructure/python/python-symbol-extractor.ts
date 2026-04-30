import type { LanguageSymbolExtractor } from '../../application/ports/language-symbol-extractor';
import type { SymbolDescriptor } from '../../domain/symbol-descriptor';

/**
 * 过渡实现：先把 PythonIndexService 的“解析结果接口”抽出来。
 * 这里故意使用低风险 regex 版本，后续再替换成 AST 实现。
 */
export class PythonSymbolExtractor implements LanguageSymbolExtractor {
  supports(path: string): boolean {
    return path.endsWith('.py');
  }

  async extract(path: string, source: string): Promise<readonly SymbolDescriptor[]> {
    const symbols: SymbolDescriptor[] = [];
    const lines = source.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]?.trimStart() ?? '';

      const classMatch = /^class\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
      const className = classMatch?.[1];
      if (className) {
        symbols.push({ name: className, kind: 'class', line: index + 1, path });
        continue;
      }

      const defMatch = /^def\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
      const functionName = defMatch?.[1];
      if (functionName) {
        symbols.push({ name: functionName, kind: 'function', line: index + 1, path });
      }
    }

    return symbols;
  }
}
