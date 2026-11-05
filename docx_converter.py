import docx
from docx.shared import Pt, Inches, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import subprocess
import json
import os
import re

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
    """Call converter_engine via Node.js for batch conversion of strings."""
    if options is None:
        options = {}
    
    payload = {
        'action': action, # 'winToUni' or 'uniToWin'
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
        encoding='utf-8'
    )
    stdout, stderr = proc.communicate(input=json.dumps(payload))
    if proc.returncode != 0:
        raise RuntimeError(f"Node converter failed: {stderr}")
    return json.loads(stdout)

def convert_docx_file(input_path, output_path, direction='win2uni', options=None):
    """
    Converts a .docx file:
    direction: 'win2uni' (Win Researcher -> Pyidaungsu Unicode)
               'uni2win' (Pyidaungsu Unicode -> Win Researcher)
    """
    doc = docx.Document(input_path)
    
    # Collect all runs across paragraphs and tables
    all_runs = []
    
    def collect_from_paragraph(p):
        for r in p.runs:
            if r.text:
                all_runs.append(r)
                
    for p in doc.paragraphs:
        collect_from_paragraph(p)
        
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for p in cell.paragraphs:
                    collect_from_paragraph(p)

    if not all_runs:
        doc.save(output_path)
        return
        
    texts = [r.text for r in all_runs]
    
    if direction == 'win2uni':
        # Check font of runs: if font is Win Researcher / Win..., convert.
        # If font is already Times New Roman / Calibri / Arial and text is English, keep!
        # But even if font was unspecified, our converter's smart English detector will protect English words!
        results = call_node_converter('winToUni', texts, options)
        for i, r in enumerate(all_runs):
            conv_res = results[i]
            r.text = conv_res['text']
            set_run_font(r, 'Pyidaungsu')
    else:
        # Pyidaungsu -> Win Researcher
        # Segments in each run: Myanmar text -> Win Researcher, English text -> Times New Roman!
        results = call_node_converter('uniToWin', texts, options)
        # For simplicity, if run contains mixed, we update text and set font
        for i, r in enumerate(all_runs):
            conv_res = results[i]
            r.text = conv_res['plainText']
            # If run was purely English, set Times New Roman; if had Myanmar, set Win Researcher
            has_myanmar = conv_res['stats']['myanmarSegments'] > 0
            if has_myanmar:
                set_run_font(r, 'Win Researcher')
            else:
                set_run_font(r, 'Times New Roman')
                
    doc.save(output_path)
    print(f"Successfully converted .docx to {output_path}")

if __name__ == '__main__':
    # Test docx conversion
    convert_docx_file('test_doc.docx', 'test_doc_converted.docx', direction='win2uni')
    doc_check = docx.Document('test_doc_converted.docx')
    for p in doc_check.paragraphs:
        for r in p.runs:
            print('Converted run text:', repr(r.text), 'Font:', r.font.name)
