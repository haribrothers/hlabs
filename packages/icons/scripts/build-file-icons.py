#!/usr/bin/env python3
"""Regenerate src/file-icons/data.ts and assets/file-icons/ from a Papirus checkout.

Usage: python3 scripts/build-file-icons.py /path/to/papirus-icon-theme/Papirus
Papirus is GPL-3.0: https://github.com/PapirusDevelopmentTeam/papirus-icon-theme
"""
import json, os, re, sys

P = sys.argv[1] if len(sys.argv) > 1 else 'papirus-icon-theme/Papirus'
M = json.load(open('assets/file-icons/manifest.json'))
FOLDER_SUFFIX = {'plain': '', 'documents': '-documents', 'pictures': '-pictures', 'music': '-music', 'videos': '-videos',
                 'downloads': '-downloads', 'shared': '-public', 'apps': '-applications', 'backup': '-backup',
                 'network': '-network', 'private': '-locked'}

def mini(s):
    s = re.sub(r'<\?xml[^>]*\?>', '', s)
    s = re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s = re.sub(r'<metadata.*?</metadata>', '', s, flags=re.S)
    s = re.sub(r'\s+', ' ', s)
    return re.sub(r'>\s+<', '><', s).strip()

data = {}
for size, d in [('64', '64x64'), ('24', '24x24')]:
    os.makedirs(f'assets/file-icons/{size}', exist_ok=True)
    for c in M['colours']:
        for k in M['folderKinds']:
            s = mini(open(os.path.realpath(f'{P}/{d}/places/folder-{c}{FOLDER_SUFFIX[k]}.svg')).read())
            data[f'{size}/folder-{c}-{k}'] = s
            open(f'assets/file-icons/{size}/folder-{c}-{k}.svg', 'w').write(s)
    for k, n in M['fileKinds'].items():
        s = mini(open(os.path.realpath(f'{P}/{d}/mimetypes/{n}.svg')).read())
        data[f'{size}/file-{k}'] = s
        open(f'assets/file-icons/{size}/file-{k}.svg', 'w').write(s)

with open('src/file-icons/data.ts', 'w') as f:
    f.write('// Generated from Papirus icon theme (GPL-3.0, https://github.com/PapirusDevelopmentTeam/papirus-icon-theme). Do not edit by hand.\n')
    f.write('// Regenerate with scripts/build-file-icons.py.\n')
    f.write('export const FILE_ICON_SVGS: Record<string, string> = ' + json.dumps(data, indent=0) + ';\n')
print(len(data), 'icons')
