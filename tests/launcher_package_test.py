"""Static packaging and encoding regression checks for the WinPS 5.1 launcher."""
from pathlib import Path
import re

root=Path(__file__).resolve().parent.parent
ps=(root/'local_server.ps1').read_bytes()
assert ps.isascii(), 'PowerShell 5.1 without a BOM interprets UTF-8 punctuation as quote characters'
assert b'[System.Net.Sockets.TcpListener]::new' in ps
assert b'[System.Text.UTF8Encoding]::new' in ps
html=(root/'index.html').read_text(encoding='utf-8')
paths=set(re.findall(r'(?:src|href)="((?:assets/)[^"]+)"',html))
assert paths, 'Expected a corporation logo asset'
for path in paths:
    assert (root/path).is_file(), 'Missing referenced asset: '+path
assert "'/assets/4nik8-corp-emblem.png'='image/png'" in ps.decode('ascii')
assert (root/'assets'/'4nik8-banner.webp').exists()
assert 'settings.json' in ps.decode('ascii')
assert 'shuffle=$shuffle' in ps.decode('ascii'), 'AppData settings host must persist radio shuffle'
assert 'url=$savedUrl' in ps.decode('ascii'), 'Preserve the actual shared URL in AppData, not only the normalized playlist ID'
print('PASS: PowerShell ASCII source and package assets')