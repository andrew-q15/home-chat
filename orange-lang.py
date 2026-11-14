import ast, re, sys

class OrangeInterpreter:
    """橘语解释器（安全版）
    只允许：数字 / 字符串 / 变量 / + - * / // % / 一元正负 / 括号
    禁止：函数调用、属性访问、下标、列表、下标类、import、幂运算（防 9**9**9 打爆 CPU）
    """
    def __init__(self):
        self.variables = {}

    def evaluate(self, expr):
        expr = expr.strip()
        if (expr.startswith('"') and expr.endswith('"')) or (expr.startswith("'") and expr.endswith("'")):
            return expr[1:-1]
        try:
            tree = ast.parse(expr, mode='eval')
        except Exception as e:
            return '[计算错误: %s]' % e

        BIN = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod)
        UN  = (ast.UAdd, ast.USub)

        def walk(node):
            if isinstance(node, ast.Expression):
                return walk(node.body)
            if isinstance(node, ast.Constant):
                if isinstance(node.value, (int, float, str)) and not isinstance(node.value, bool):
                    return node.value
                raise ValueError('只支持数字和字符串')
            if isinstance(node, ast.Name):
                if node.id in self.variables:
                    v = self.variables[node.id]
                    if isinstance(v, (int, float, str)):
                        return v
                raise ValueError('[未定义: %s]' % node.id)
            if isinstance(node, ast.UnaryOp) and isinstance(node.op, UN):
                v = walk(node.operand)
                return +v if isinstance(node.op, ast.UAdd) else -v
            if isinstance(node, ast.BinOp) and isinstance(node.op, BIN):
                a, b = walk(node.left), walk(node.right)
                if isinstance(node.op, ast.Add):      return a + b
                if isinstance(node.op, ast.Sub):      return a - b
                if isinstance(node.op, ast.Mult):     return a * b
                if isinstance(node.op, ast.Div):
                    if b == 0: raise ValueError('除数不能为 0')
                    return a / b
                if isinstance(node.op, ast.FloorDiv):
                    if b == 0: raise ValueError('除数不能为 0')
                    return a // b
                if isinstance(node.op, ast.Mod):
                    if b == 0: raise ValueError('除数不能为 0')
                    return a % b
            raise ValueError('表达式含不允许的语法（仅支持数字、字符串、变量、+ - * / // % 与括号）')

        try:
            return walk(tree)
        except Exception as e:
            return '[计算错误: %s]' % e

    @staticmethod
    def _strip_comment(line):
        # 剥行尾注释；保留整除 // 与字符串里的 //
        for m in re.finditer(r'//', line):
            i = m.start()
            before = line[:i]
            if before.count('"') % 2 or before.count("'") % 2:
                continue                      # 引号内的 // 是字符串内容
            left, right = before.rstrip(), line[i + 2:].lstrip()
            left_ok = bool(left) and (left[-1].isalnum() or left[-1] in ')_）')
            right_ok = bool(right) and (
                right[0].isdigit() or right[0] in '(（' or
                (right[0] in '+-' and len(right) > 1 and right[1].isdigit()))
            if left_ok and right_ok:
                continue                      # a // b 是整除，不是注释
            return before.rstrip()
        return line.strip()

    def run(self, code):
        lines = [self._strip_comment(l) for l in code.split('\n')]
        lines = [l for l in lines if l]
        for line in lines:
            m_print = re.match(r'打印\((.*)\);?', line)
            if m_print:
                expr = m_print.group(1).strip().rstrip(';').strip()
                try:
                    print(self.evaluate(expr))
                except Exception as e:
                    print('[执行错误: %s]' % e)
                continue
            m_var = re.match(r'(橘子|文字)\s+([a-zA-Z0-9_\u4e00-\u9fa5]+)\s*=\s*(.*);?', line)
            if m_var:
                t, n, e = m_var.groups()
                e = e.strip().rstrip(';').strip()   # 分号不能进 ast.parse(mode='eval')
                v = self.evaluate(e)
                if isinstance(v, str) and (v.startswith('[计算错误') or v.startswith('[未定义')):
                    print('[赋值错误: %s]' % v)     # 不把错误文本当变量值存表
                    continue
                try:
                    if t == '橘子':
                        self.variables[n] = float(v) if '.' in str(v) else int(float(v))
                    else:
                        self.variables[n] = str(v)
                except Exception:
                    self.variables[n] = v
                continue

if __name__ == '__main__':
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            OrangeInterpreter().run(f.read())
