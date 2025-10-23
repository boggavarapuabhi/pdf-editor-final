import io, uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
import fitz  # PyMuPDF

app = FastAPI(title="PDF Text Editor API", version="1.0")
STORE = {}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

@app.post("/upload")
async def upload(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF allowed")
    data = await file.read()
    fid = f"f_{uuid.uuid4().hex}"
    STORE[fid] = data
    return {"file_id": fid}

@app.post("/edit_replace")
async def edit_replace(payload: dict):
    fid = payload.get("file_id")
    find = payload.get("find")
    repl = payload.get("replace")
    page = payload.get("page")
    if not fid or not find or repl is None:
        raise HTTPException(status_code=400, detail="Need file_id, find, replace")
    if fid not in STORE:
        raise HTTPException(status_code=404, detail="File not found")

    doc = fitz.open(stream=STORE[fid], filetype="pdf")
    replaced = 0
    def replace_on_page(pg, needle, repl_text):
        nonlocal replaced
        for rect in pg.search_for(needle):
            pg.draw_rect(rect, color=(1,1,1), fill=(1,1,1))
            pg.insert_textbox(rect, repl_text, fontsize=10)
            replaced += 1
    if page:
        idx = page - 1
        if idx < 0 or idx >= doc.page_count:
            raise HTTPException(status_code=400, detail="Invalid page")
        replace_on_page(doc.load_page(idx), find, repl)
    else:
        for pno in range(doc.page_count):
            replace_on_page(doc.load_page(pno), find, repl)
    out = io.BytesIO()
    doc.save(out)
    rid = f"r_{uuid.uuid4().hex}"
    STORE[rid] = out.getvalue()
    return {"revision_id": rid, "replaced": replaced}

@app.get("/download")
def download(revision_id: str):
    data = STORE.get(revision_id)
    if not data:
        raise HTTPException(status_code=404, detail="Not found")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf")
