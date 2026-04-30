import * as vscode from 'vscode';

const DEFAULT_TYPE_MAPPINGS: Record<string, string[]> = {
    btn: ['Button', 'btn'],
    checkbox: ['CheckBox'],
    label: ['Label'],
    item: ['Item'],
    tab: ['Tab'],
    edit: ['LineEdit'],
    combobox: ['ComboBox'],
    menu: ['QMenu'],
    msgdlg: ['MessageDlg']
};

type TypeMappings = Record<string, string[]>;

export class SniffWidgetDefCopyService {
    public buildCopyText(widgetDef: Record<string, unknown>): string | null {
        if (!Object.keys(widgetDef).length) {
            return null;
        }

        const widgetDefText = JSON.stringify(widgetDef, null, 2);
        const attrText = this.formatAttrBlock(widgetDefText);
        const propertyName = this.resolvePropertyName(widgetDef);
        const hasText = Boolean(widgetDef['text']);

        if (hasText) {
            return [
                '',
                '    @property',
                `    def ${propertyName}(self):`,
                '        return Ele(',
                '            desc="",',
                `            attr=${attrText},`,
                '            tr={',
                '                "zh_CN": ""',
                '            }',
                '        )',
                '    '
            ].join('\n');
        }

        return [
            '',
            '    @property',
            `    def ${propertyName}(self):`,
            '        return Ele(',
            '            desc="",',
            `            attr=${attrText},`,
            '        )',
            '    '
        ].join('\n');
    }

    private resolvePropertyName(widgetDef: Record<string, unknown>): string {
        const widgetType = String(widgetDef['type'] || '').toLowerCase();
        const widgetText = String(widgetDef['text'] || '');
        const mappedType = this.matchTypeSuffix(widgetType);

        if (!mappedType) {
            return '1_请到_PATH_Plugin_Settings_>_Sniff_类型映射中完善配置';
        }

        if (!widgetText) {
            return '1_该元素没有text请结合英文环境名称和type命名';
        }

        return `${widgetText}_${mappedType}`
            .replace(/[ .\-/]/g, '_')
            .toLowerCase();
    }

    private matchTypeSuffix(widgetType: string): string | null {
        if (!widgetType) {
            return null;
        }

        const typeMappings = this.getTypeMappings();
        for (const [typeName, aliases] of Object.entries(typeMappings)) {
            for (const alias of aliases) {
                if (widgetType.includes(alias.toLowerCase())) {
                    return typeName;
                }
            }
        }

        return null;
    }

    private getTypeMappings(): TypeMappings {
        const config = vscode.workspace.getConfiguration('path.sniff');
        const configuredValue = config.get<unknown>('typeMappings', DEFAULT_TYPE_MAPPINGS);
        if (!configuredValue || typeof configuredValue !== 'object' || Array.isArray(configuredValue)) {
            return DEFAULT_TYPE_MAPPINGS;
        }

        const normalizedMappings: TypeMappings = {};
        for (const [typeName, aliases] of Object.entries(configuredValue as Record<string, unknown>)) {
            if (!Array.isArray(aliases)) {
                continue;
            }

            const normalizedAliases = aliases
                .filter((alias): alias is string => typeof alias === 'string' && alias.length > 0);

            if (normalizedAliases.length > 0) {
                normalizedMappings[typeName] = normalizedAliases;
            }
        }

        return normalizedMappings;
    }

    private formatAttrBlock(widgetDefText: string): string {
        const lines = widgetDefText.split('\n');
        if (lines.length === 0) {
            return '{}';
        }

        return [lines[0], ...lines.slice(1).map(line => `${'    '.repeat(3)}${line}`)].join('\n');
    }
}
