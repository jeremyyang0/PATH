#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import ast
import json
import os
import sys
from pathlib import Path

# 设置环境变量确保UTF-8编码
os.environ['PYTHONIOENCODING'] = 'utf-8'

# 设置标准输出编码为UTF-8，解决跨平台中文乱码问题
def setup_encoding():
    """设置输出编码为UTF-8"""
    if sys.platform == 'win32':
        # Windows系统设置控制台编码
        try:
            os.system('chcp 65001 > nul 2>&1')
        except Exception:
            pass

# 初始化编码设置
setup_encoding()

class EleParser:
    def __init__(self, root_dir):
        self.root_dir = Path(root_dir)
        self.results = []
        self.package_names = {}  # 存储包名对应的中文名称
    
    def is_ele_call(self, node):
        """检查节点是否是Ele类的调用"""
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id == 'Ele':
                return True
            elif isinstance(node.func, ast.Attribute) and node.func.attr == 'Ele':
                return True
        return False
    
    def extract_package_name(self, init_file_path):
        """从__init__.py文件中提取包的中文名称"""
        try:
            with open(init_file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            tree = ast.parse(content)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    class_name = node.name
                    
                    # 如果类名包含中文，直接使用
                    if any('\u4e00' <= char <= '\u9fff' for char in class_name):
                        return class_name
                    
                    # 查找类中的字符串常量或属性
                    for item in node.body:
                        if isinstance(item, ast.Assign):
                            for target in item.targets:
                                if isinstance(target, ast.Name):
                                    # 查找可能包含中文名称的属性
                                    if target.id in ['name', 'display_name', 'title', 'chinese_name', 'desc', 'description']:
                                        if isinstance(item.value, ast.Constant) and isinstance(item.value.value, str):
                                            value = item.value.value
                                            if any('\u4e00' <= char <= '\u9fff' for char in value):
                                                return value
                        elif isinstance(item, ast.Expr) and isinstance(item.value, ast.Constant):
                            # 查找类文档字符串
                            if isinstance(item.value.value, str):
                                value = item.value.value
                                if any('\u4e00' <= char <= '\u9fff' for char in value):
                                    return value
            
            return None
            
        except Exception as e:
            return None
    
    def scan_packages(self):
        """扫描所有包并提取中文名称"""
        method_dir = self.root_dir / "method"
        if not method_dir.exists():
            return
        
        # 递归扫描所有包
        for root, dirs, files in os.walk(method_dir):
            if '__init__.py' in files:
                init_file = Path(root) / '__init__.py'
                
                # 获取相对于method目录的路径
                rel_path = Path(root).relative_to(method_dir)
                
                # 提取包名
                package_name = str(rel_path).replace(os.sep, '.')
                if package_name == '.':
                    package_name = 'method'
                else:
                    package_name = 'method.' + package_name
                
                # 提取中文名称
                chinese_name = self.extract_package_name(init_file)
                if chinese_name:
                    self.package_names[package_name] = chinese_name
                    # 也为目录名存储映射
                    dir_name = rel_path.name
                    if dir_name:
                        self.package_names[dir_name] = chinese_name
    
    def extract_ele_variables(self, class_node):
        """提取类中所有有desc参数的Ele类变量"""
        ele_variables = []
        
        for item in class_node.body:
            if isinstance(item, ast.Assign):
                for target in item.targets:
                    if isinstance(target, ast.Name):
                        if self.is_ele_call(item.value):
                            ele_var = {
                                'name': target.id,
                                'value': ast.unparse(item.value),
                                'line': item.lineno,
                                'arguments': [],
                                'desc': '',
                                'hierarchy': []
                            }
                            
                            has_desc = False
                            
                            if isinstance(item.value, ast.Call):
                                for arg in item.value.args:
                                    ele_var['arguments'].append(ast.unparse(arg))
                                for keyword in item.value.keywords:
                                    arg_value = ast.unparse(keyword.value)
                                    ele_var['arguments'].append(f"{keyword.arg}={arg_value}")
                                    
                                    if keyword.arg == 'desc':
                                        has_desc = True
                                        desc_value = arg_value.strip('"\'')
                                        ele_var['desc'] = desc_value
                                        if ' -> ' in desc_value:
                                            ele_var['hierarchy'] = desc_value.split(' -> ')
                                        else:
                                            ele_var['hierarchy'] = [desc_value]
                            
                            # 只添加有desc参数的变量
                            if has_desc:
                                ele_variables.append(ele_var)
        
        return ele_variables
    
    def parse_file(self, file_path):
        """解析单个Python文件"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            tree = ast.parse(content)
            file_results = []
            
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef) and node.name.endswith('Ele'):
                    ele_variables = self.extract_ele_variables(node)
                    
                    if ele_variables:
                        class_info = {
                            'file_path': str(file_path),
                            'class_name': node.name,
                            'class_line': node.lineno,
                            'base_classes': [ast.unparse(base) for base in node.bases],
                            'ele_variables': ele_variables
                        }
                        file_results.append(class_info)
            
            return file_results
            
        except Exception as e:
            # 忽略解析错误的文件
            return []
    
    def parse_method_file(self,file_path):
        """解析Python文件中的方法"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            tree = ast.parse(content)
            method_results = []
            
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef) and not node.name.startswith("_"):
                    method_info = {
                        'name': node.name,
                        'line': node.lineno,
                        'doc': self.extract_method_doc(node) if self.extract_method_doc(node) else node.name
                    }
                    method_results.append(method_info)
            if method_results:
                return [{"file_path":str(file_path), "methods": method_results}]
            else:
                return []
        except Exception as e:
            return []
    
    def extract_method_doc(self, node):
        """提取方法的文档字符串"""
        for item in node.body:
            if isinstance(item, ast.Expr) and isinstance(item.value, ast.Constant) and isinstance(item.value.value, str):
                return item.value.value
        return ""
    def scan_directory(self):
        """扫描目录中的所有Python文件"""
        python_files = []
        method_dir = self.root_dir / "method"
        if not method_dir.exists():
            return
        
        for root, dirs, files in os.walk(method_dir):
            for file in files:
                if file.endswith(".py"):
                    python_files.append(Path(root) / file)
        
        return python_files
    
    def parse_all_files(self):
        """解析所有Python文件"""
        # 先扫描所有包的中文名称
        self.scan_packages()
        
        python_files = self.scan_directory()
        ele_results = []
        method_results = []
        
        for file_path in python_files:
            file_results = self.parse_file(file_path)
            methods = self.parse_method_file(file_path)
            ele_results.extend(file_results)
            method_results.extend(methods)
        
        return {
            'results': ele_results,
            'package_names': self.package_names,
            'method_results': method_results
        }

def main():
    if len(sys.argv) != 2:
        print("用法: python parse_ele.py <工作区路径>", file=sys.stderr)
        sys.exit(1)
    
    workspace_path = sys.argv[1]
    
    try:
        parser = EleParser(workspace_path)
        results = parser.parse_all_files()
        
        # 输出JSON格式结果，确保UTF-8编码
        json_output = json.dumps(results, ensure_ascii=False, indent=None)
        
        # 确保输出为UTF-8编码
        try:
            # 尝试直接输出UTF-8
            print(json_output)
        except UnicodeEncodeError:
            # 如果出现编码错误，强制使用UTF-8
            print(json_output.encode('utf-8').decode('utf-8'))
        
    except Exception as e:
        print(f"解析失败: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 