#!/usr/bin/env python3
"""
Command Line Interface (CLI) for Win Researcher ⇄ Pyidaungsu Converter
Usage:
  python converter_cli.py input.docx output.docx --direction win2uni
  python converter_cli.py input.txt output.txt --direction uni2win
"""

import sys
import os
import argparse
from docx_converter import convert_docx_file, call_node_converter

def convert_txt_file(input_path, output_path, direction='win2uni', options=None):
    with open(input_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    action = 'winToUni' if direction == 'win2uni' else 'uniToWin'
    res = call_node_converter(action, [content], options)[0]
    out_text = res['text'] if direction == 'win2uni' else res['plainText']
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(out_text)
    print(f"Successfully converted {input_path} -> {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Win Researcher <-> Pyidaungsu Converter")
    parser.add_argument("input", help="Input file path (.docx or .txt)")
    parser.add_argument("output", help="Output file path (.docx or .txt)")
    parser.add_argument("--direction", choices=['win2uni', 'uni2win'], default='win2uni',
                        help="Conversion direction (win2uni: Win Researcher -> Pyidaungsu, uni2win: Pyidaungsu -> Win Researcher)")
    parser.add_argument("--no-english-detect", action="store_true", help="Disable smart English detection")
    parser.add_argument("--number-mode", choices=['auto', 'myanmar', 'latin'], default='auto',
                        help="Number conversion mode")

    args = parser.parse_args()

    options = {
        'detectEnglish': not args.no_english_detect,
        'preserveEnglish': not args.no_english_detect,
        'numberMode': args.number_mode
    }

    ext = os.path.splitext(args.input)[1].lower()
    if ext == '.docx':
        convert_docx_file(args.input, args.output, direction=args.direction, options=options)
    elif ext in ['.txt', '.md', '.csv']:
        convert_txt_file(args.input, args.output, direction=args.direction, options=options)
    else:
        print(f"Error: Unsupported file format '{ext}'. Supported: .docx, .txt")
        sys.exit(1)

if __name__ == '__main__':
    main()
