/**
 * 转换为驼峰命名
 */
export function toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 转换为帕斯卡命名
 */
export function toPascalCase(str: string): string {
    return str.replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase());
}

/**
 * 生成导入路径
 */
export function generateImportPath(eleFilePath: string): string {
    // 将文件路径转换为Python模块路径，只保留从method开始的部分
    const normalizedPath = eleFilePath.replace(/\\/g, '/');
    const methodIndex = normalizedPath.indexOf('/method/');
    
    if (methodIndex !== -1) {
        // 从method开始截取路径
        const methodPath = normalizedPath.substring(methodIndex + 1);
        return methodPath.replace(/\.py$/, '').replace(/\//g, '.');
    } else {
        // 如果没有找到method，尝试查找method在路径开始的情况
        const methodMatch = normalizedPath.match(/method[\/\\](.+)$/);
        if (methodMatch) {
            return methodMatch[0].replace(/\.py$/, '').replace(/[\/\\]/g, '.');
        }
    }
    // 兜底：去掉.py后缀并转换路径分隔符
    return normalizedPath.replace(/\.py$/, '').replace(/\//g, '.');
}

/**
 * 生成方法代码
 */
export function generateMethodCode(variableName: string, operationType: 'click' | 'double_click', eleDesc: string): { methodName: string, methodCode: string } {
    const methodName = `${operationType}_${variableName}`;
    const operationComment = operationType === 'click' ? '点击' : '双击';
    const operationCall = operationType === 'click' ? 'click()' : 'double_click()';
    
    return {
        methodName,
        methodCode: `    def ${methodName}(self):
        """${operationComment} ${eleDesc}"""
        self.${variableName}.${operationCall}
`
    };
} 