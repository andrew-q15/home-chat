import re, sys

class OrangeInterpreter:
    def __init__(self): self.variables = {}
    
    def run(self, code):
        lines = [line.split('//')[0].strip() for line in code.split('\n') if line.split('//')[0].strip()]
        for line in lines:
            m_print = re.match(r'打印\((.*)\);?', line)
            if m_print:
                try:
                    print(self.evaluate(m_print.group(1)))
                except Exception as e:
                    print(f"[执行错误: {e}]")
                continue
                
            m_var = re.match(r'(橘子|文字)\s+([a-zA-Z0-9_\u4e00-\u9fa5]+)\s*=\s*(.*);?', line)
            if m_var:
                t, n, e = m_var.groups()
                try:
                    v = self.evaluate(e)
                    # 加强类型转换防御
                    if t == '橘子':
                        if isinstance(v, str) and ('[' in v or '错误' in v):
                            self.variables[n] = v # 保留错误信息
                        else:
                            self.variables[n] = float(v) if '.' in str(v) else int(float(v))
                    else:
                        self.variables[n] = str(v)
                except Exception:
                    self.variables[n] = self.evaluate(e)
                continue

    def evaluate(self, expr):
        expr = expr.strip()
        if (expr.startswith('"') and expr.endswith('"')) or (expr.startswith("'") and expr.endswith("'")): return expr[1:-1]
        if re.match(r'^-?\d+(\.\d+)?$', expr): return float(expr) if '.' in expr else int(expr)
        if re.match(r'^[a-zA-Z0-9_\u4e00-\u9fa5]+$', expr): return self.variables.get(expr, f"[未定义: {expr}]")
        try:
            # 替换变量，但避免把汉字也替换了
            for n, v in self.variables.items():
                if isinstance(v, (int, float)):
                    expr = re.sub(r'\b' + n + r'\b', str(v), expr)
            return eval(expr, {'__builtins__': {}}, {})
        except Exception as e:
            return f"[计算错误: {e}]"

if __name__ == '__main__':
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            OrangeInterpreter().run(f.read())
