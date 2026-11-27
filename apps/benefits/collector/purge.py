"""One-time authenticated purge of definitively closed public notices from D1.

No personal profiles. Never prints credentials or credential-bearing URLs.
Cloudflare scheduled purge continues independently after deployment.
"""
import json
import os
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

def main():
    endpoint=os.getenv("INGEST_URL","")
    token=os.getenv("INGEST_TOKEN","")
    parts=urlsplit(endpoint)
    if parts.scheme!="https" or not parts.hostname or not endpoint.endswith("/api/ingest") or not token:
        raise RuntimeError("D1 ingest connection not configured")
    url=endpoint[:-len("/api/ingest")]+"/api/ingest/purge"
    req=Request(url, data=b"{}", method="POST",
                headers={"Authorization":"Bearer "+token,"Content-Type":"application/json"})
    try:
        with urlopen(req,timeout=30) as response:
            result=json.load(response)
    except Exception:
        raise RuntimeError("D1 purge request failed; check Worker deployment and authentication") from None
    deleted=result.get("deleted")
    if not isinstance(deleted,int) or deleted<0:
        raise RuntimeError("D1 purge returned unexpected response")
    print("Confirmed closed/expired notices permanently deleted:",deleted)

if __name__=="__main__":
    main()
