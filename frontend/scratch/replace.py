import re

with open('c:/Users/PC/Desktop/botsolutionsdashboard/frontend/src/components/common/sidebar.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = '''  const rawAccessChildren = useMemo(
    () => [
      { label: "Permissions", to: "/access", icon: iconLock(), perm: "access" },
      { label: "Roles", to: "/access/roles", icon: iconUsersCog(), perm: "access" },
      { label: "Users", to: "/access/users", icon: iconUser(), perm: "access" },
      { label: "Kiosk Devices", to: "/access/kiosk-devices", icon: iconMonitorSmartphone(), perm: "access" },
    ],
    []
  );'''

target_pattern = r'const rawAccessChildren.*?\[.*?\],.*?\[\]\s*\);'
match = re.search(target_pattern, content, re.DOTALL)
if match:
    content = content[:match.start()] + replacement + content[match.end():]
    with open('c:/Users/PC/Desktop/botsolutionsdashboard/frontend/src/components/common/sidebar.jsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Soft replaced successfully')
else:
    print('Not found')
