#!/usr/bin/env python3
"""Tiny local server for the Schichtplan app; Python standard library only."""
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import json, os
ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'shifts.json'
PORT = int(os.environ.get('PORT', '3000'))
def read_shifts():
    try:
        value = json.loads(DATA.read_text(encoding='utf-8'))
        return value if isinstance(value, list) else []
    except (OSError, json.JSONDecodeError): return []
def escape_ics(value): return str(value).replace('\\','\\\\').replace('\n','\\n').replace(',','\\,').replace(';','\\;')
def make_calendar():
    events=[]; stamp=datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    for s in read_shifts():
        date=s.get('date',''); start=s.get('actualStart') or s.get('start','00:00'); end=s.get('actualEnd') or s.get('end','00:00'); end_date=date
        if end<=start: end_date=(datetime.strptime(date,'%Y-%m-%d')+timedelta(days=1)).strftime('%Y-%m-%d')
        desc=f"Pause: {s.get('breakMinutes',0)} min\nFrankfurt (7 min): {'Ja' if s.get('frankfurt') else 'Nein'}"
        if s.get('actualStart') or s.get('actualEnd'): desc+=f"\nAbweichung: {s.get('actualStart') or start}–{s.get('actualEnd') or end}"
        events += ['BEGIN:VEVENT',f"UID:shift-{s.get('id','')}@schichtplan.local",f'DTSTAMP:{stamp}',f"DTSTART:{date.replace('-','')}T{start.replace(':','')}00",f"DTEND:{end_date.replace('-','')}T{end.replace(':','')}00",f"SUMMARY:{escape_ics('Schicht '+str(s.get('number','')))}",f'DESCRIPTION:{escape_ics(desc)}','END:VEVENT']
    return '\r\n'.join(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Persoenlicher Schichtplan//DE','CALSCALE:GREGORIAN',*events,'END:VCALENDAR','']).encode()
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/api/shifts': body=json.dumps(read_shifts(),ensure_ascii=False).encode(); content='application/json; charset=utf-8'
        elif path=='/calendar.ics': body=make_calendar(); content='text/calendar; charset=utf-8'
        else:
            file=ROOT/('index.html' if path in ('/','') else Path(path).name)
            try: body=file.read_bytes()
            except OSError: self.send_error(404); return
            content={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'}.get(file.suffix,'application/octet-stream')
        self.send_response(200); self.send_header('Content-Type',content); self.send_header('Content-Length',str(len(body))); self.send_header('Cache-Control','no-cache'); self.end_headers(); self.wfile.write(body)
    def do_PUT(self):
        if urlparse(self.path).path!='/api/shifts': self.send_error(404); return
        try:
            val=json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
            if not isinstance(val,list): raise ValueError()
            DATA.write_text(json.dumps(val,ensure_ascii=False,indent=2),encoding='utf-8'); body=b'{"ok":true}'
            self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
        except (ValueError,json.JSONDecodeError): self.send_error(400,'Ungueltige Schichtdaten')
    def log_message(self,*_args): pass
if __name__=='__main__':
    print(f'Schichtplan läuft auf http://localhost:{PORT}')
    ThreadingHTTPServer(('0.0.0.0',PORT),Handler).serve_forever()
