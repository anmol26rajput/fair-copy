"""Shared helpers: load text from .txt/.md/.docx/.pdf, tokenise words, 8-gram shingles."""
import html, re, shutil, subprocess, sys, zipfile

N = 8
WORD = re.compile(r"\w+(?:['’]\w+)*")


def load_text(path):
    low = path.lower()
    try:
        if low.endswith(".docx"):
            with zipfile.ZipFile(path) as z:
                xml = z.read("word/document.xml").decode("utf8")
            xml = re.sub(r"</w:p>|<w:br\s*/>", "\n", xml)
            return html.unescape(re.sub(r"<[^>]+>", "", xml))
        if low.endswith(".pdf"):
            return _pdf(path)
        with open(path, encoding="utf8", errors="replace") as f:
            return f.read()
    except (OSError, KeyError, zipfile.BadZipFile) as e:
        sys.exit(f"Cannot read {path}: {e}")


def _pdf(path):
    try:
        import pypdf
    except ImportError:
        pypdf = None
    if pypdf:
        return "\n".join(p.extract_text() or "" for p in pypdf.PdfReader(path).pages)
    if shutil.which("pdftotext"):
        return subprocess.run(["pdftotext", path, "-"], capture_output=True, text=True, check=True).stdout
    sys.exit("PDF support needs the pypdf package (pip install pypdf) or the pdftotext command; neither was found.")


def words(text):
    """[(normalised_word, start_char, end_char)]: lowercase, punctuation stripped."""
    return [(re.sub(r"['’]", "", m.group().lower()), m.start(), m.end()) for m in WORD.finditer(text)]


def shingles(norm, n=N):
    """{8-gram tuple: first word index}"""
    d = {}
    for i in range(len(norm) - n + 1):
        d.setdefault(tuple(norm[i:i + n]), i)
    return d
