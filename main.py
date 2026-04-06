from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"status": "Active", "message": "Consent API is running"}

@app.get("/check-consent/{borrower}")
def check_consent(borrower: str):
    # Your logic to check the blockchain or database goes here
    return {"borrower": borrower, "authorized": True}