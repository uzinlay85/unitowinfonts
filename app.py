from flask import Flask, request, jsonify, send_file, send_from_directory
import os
import io
import docx
from docx.shared import Pt, Inches
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import subprocess
import json

app = Flask(__name__, static_folder='.', static_url_path='')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def set_run_font(run, font_name):
    run.font.name = font_name
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:ascii'), font_name)
    rFonts.set(qn('w:hAnsi'), font_name)
    rFonts.set(qn('w:cs'), font_name)

def call_node_converter(action, texts, options=None):
    if options is None:
        options = {}
    
    payload = {
        'action': action,
        'texts': texts,
        'options': options
    }
    
    script = """
    const fs = require('fs');
    global.window = global;
    eval(fs.readFileSync('tlsMyanmarConverter.js', 'utf8'));
    eval(fs.readFileSync('tlsMyanmarConverterData.js', 'utf8'));
    eval(fs.readFileSync('english_dict.js', 'utf8'));
    global.tlsMyanmarConverters = tlsMyanmarConverters;
    global.ENG_DICT = ENG_DICT;
    const MM_CONVERTER = require('./converter_engine.js');

    const inputData = JSON.parse(fs.readFileSync(0, 'utf-8'));
    const results = [];
    for (const t of inputData.texts) {
        if (inputData.action === 'winToUni') {
            results.push(MM_CONVERTER.winToUnicode(t, inputData.options));
        } else {
            results.push(MM_CONVERTER.unicodeToWin(t, inputData.options));
        }
    }
    process.stdout.write(JSON.stringify(results));
    """
    
    proc = subprocess.Popen(
        ['node', '-e', script],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        cwd=BASE_DIR
    )
    stdout, stderr = proc.communicate(input=json.dumps(payload))
    if proc.returncode != 0:
        raise RuntimeError(f"Converter error: {stderr}")
    return json.loads(stdout)

@app.route('/')
def index():
    return send_file(os.path.join(BASE_DIR, 'index.html'))

@app.route('/fonts/<path:filename>')
def serve_fonts(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'fonts'), filename)

@app.route('/api/convert-text', methods=['POST'])
def api_convert_text():
    data = request.json or {}
    text = data.get('text', '')
    direction = data.get('direction', 'win2uni')
    options = data.get('options', {})

    action = 'winToUni' if direction == 'win2uni' else 'uniToWin'
    results = call_node_converter(action, [text], options)
    return jsonify(results[0])

@app.route('/api/convert-text-to-docx', methods=['POST'])
def api_convert_text_to_docx():
    data = request.json or {}
    text = data.get('text', '')
    direction = data.get('direction', 'win2uni')
    options = data.get('options', {})

    action = 'winToUni' if direction == 'win2uni' else 'uniToWin'
    results = call_node_converter(action, [text], options)
    res = results[0]

    doc = docx.Document()
    
    if direction == 'win2uni':
        # Result is Unicode
        p = doc.add_paragraph()
        run = p.add_run(res['text'])
        set_run_font(run, 'Pyidaungsu')
        run.font.size = Pt(13)
    else:
        # Result is Win Researcher
        p = doc.add_paragraph()
        segments = res.get('segments', [])
        for seg in segments:
            if seg['type'] == 'myanmar':
                conv_text = call_node_converter('uniToWin', [seg['text']], options)[0]['plainText']
                r = p.add_run(conv_text)
                set_run_font(r, 'Win Researcher')
                r.font.size = Pt(13)
            else:
                r = p.add_run(seg['text'])
                set_run_font(r, 'Times New Roman')
                r.font.size = Pt(12)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    
    filename = 'Converted_Pyidaungsu.docx' if direction == 'win2uni' else 'Converted_WinResearcher.docx'
    return send_file(
        buf,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )

@app.route('/api/convert-file', methods=['POST'])
def api_convert_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    direction = request.form.get('direction', 'win2uni')
    detect_english = request.form.get('detectEnglish', 'true').lower() == 'true'
    smart_punctuation = request.form.get('smartPunctuation', 'true').lower() == 'true'
    number_mode = request.form.get('numberMode', 'auto')

    options = {
        'detectEnglish': detect_english,
        'preserveEnglish': detect_english,
        'smartPunctuation': smart_punctuation,
        'numberMode': number_mode
    }

    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()

    if ext == '.txt':
        content = file.read().decode('utf-8', errors='ignore')
        action = 'winToUni' if direction == 'win2uni' else 'uniToWin'
        results = call_node_converter(action, [content], options)
        out_text = results[0]['text'] if direction == 'win2uni' else results[0]['plainText']
        
        buf = io.BytesIO(out_text.encode('utf-8'))
        return send_file(
            buf,
            as_attachment=True,
            download_name=f'Converted_{filename}',
            mimetype='text/plain; charset=utf-8'
        )

    elif ext == '.docx':
        doc = docx.Document(file)
        all_runs = []

        def collect(p):
            for r in p.runs:
                if r.text:
                    all_runs.append(r)

        for p in doc.paragraphs:
            collect(p)
        for tbl in doc.tables:
            for row in tbl.rows:
                for cell in row.cells:
                    for p in cell.paragraphs:
                        collect(p)

        if all_runs:
            texts = [r.text for r in all_runs]
            action = 'winToUni' if direction == 'win2uni' else 'uniToWin'
            results = call_node_converter(action, texts, options)

            for i, r in enumerate(all_runs):
                res = results[i]
                if direction == 'win2uni':
                    r.text = res['text']
                    set_run_font(r, 'Pyidaungsu')
                else:
                    r.text = res['plainText']
                    if res['stats'].get('myanmarSegments', 0) > 0:
                        set_run_font(r, 'Win Researcher')
                    else:
                        set_run_font(r, 'Times New Roman')

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        return send_file(
            buf,
            as_attachment=True,
            download_name=f'Converted_{filename}',
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
    else:
        return jsonify({'error': 'Unsupported file format'}), 400

if __name__ == '__main__':
    print("==================================================================")
    print("  Win Researcher ⇄ Pyidaungsu (Myanmar Font Converter)")
    print("  Starting server at: http://localhost:5000")
    print("==================================================================")
    app.run(host='127.0.0.1', port=5000, debug=False)
