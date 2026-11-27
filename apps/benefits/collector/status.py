"""Read-only credential-free status of the five KST collector slots and budget."""
import datetime as dt
from scheduler import KST, STATE_DIR, SUCCESS_FILE, slot_at, last_success_slot, needs_collection, next_run
from quota import quota_config
import json

def main():
    now=dt.datetime.now(KST)
    last=last_success_slot(STATE_DIR / SUCCESS_FILE)
    print("Timezone: Asia/Seoul")
    print("Current:",now.isoformat(timespec="seconds"))
    print("Daily official-API refresh slots: 10:00, 12:00, 14:00, 16:00, 18:00")
    print("Last completed slot:",last.isoformat(timespec="minutes") if last else "none")
    print("Next slot:",next_run(now).isoformat(timespec="minutes"))
    print("Collection due:", "yes" if needs_collection(now,last) else "no")
    usage=STATE_DIR/"api-usage.json"
    try:
        data=json.loads(usage.read_text(encoding="utf8"))
    except FileNotFoundError:
        data={}
    except ValueError:
        data={"ERROR":"corrupt API usage ledger"}
    for source in ("GOV24","BIZINFO"):
        try:
            approved,budget=quota_config(source)
            used=max(int(data.get(now.date().isoformat()+":KST:"+source,0)),
                     int(data.get(now.astimezone(dt.timezone.utc).date().isoformat()+":UTC:"+source,0)))
            print(source,"daily approved:",approved,"budget:",budget,"reserved today:",used)
        except (RuntimeError,ValueError,TypeError):
            print(source,"quota or ledger is not configured/valid")
    print("Source API connectivity: not tested by this read-only command")

if __name__=="__main__":
    main()
