import subprocess
import re

def scan_via_mac_system_profiler():
    print("🔍 正在通过 Mac 底层系统获取蓝牙设备列表...")
    try:
        # 调用 Mac 的 system_profiler 获取蓝牙设备
        result = subprocess.check_output(['system_profiler', 'SPBluetoothDataType'], text=True)
        
        # 查找包含 Joy-Con 的行
        if 'Joy-Con' in result or 'Joy-Con (R)' in result:
            print("\n✅ 成功！Mac 的蓝牙系统已经识别到了 Joy-Con！")
            
            # 简单打印一下匹配到的行
            for line in result.split('\n'):
                if 'Joy-Con' in line:
                    print(f"  👉 {line.strip()}")
        else:
            print("\n❌ 没有发现 Joy-Con。请检查：")
            print("1. 蓝牙是否连接成功？")
            print("2. 是否按了滑轨上的小圆点进行配对？")
            print("\n提示：如果 Mac 蓝牙里压根没出现 Joy-Con，尝试按住配对键 3 秒直到灯狂闪。")
    except Exception as e:
        print(f"⚠ 获取系统蓝牙信息失败: {e}")

if __name__ == '__main__':
    scan_via_mac_system_profiler()
