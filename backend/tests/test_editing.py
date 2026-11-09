"""Admin edits after sending: request details, customer details, re-pricing sent or chosen quotes,
and the exact email preview (sender, recipient, HTML, text and the real attachments)."""
from test_agent import client, signup  # noqa: F401
import pytest

from test_options import make_listing

BASE = {"freight_cost_bsd": 20, "freight_markup_pct": 0, "insurance_bsd": 0, "fx_cny_usd": 0.14}


@pytest.fixture(scope="module")
def u():
    r = client.post("/auth/login", json={"email": "admin@aimoro.test", "password": "password123"})
    admin = ({"Authorization": f"Bearer {r.json()['token']}"} if r.status_code == 200
             else signup("admin@aimoro.test", "Ashley")[0])
    cust, user = signup("edit-cust@example.com", "Kayla Rolle")
    return {"admin": admin, "cust": cust, "user": user}


def _request(u, name="Office chair", qty=1):
    return client.post("/requests", headers=u["cust"], json={"product_name": name, "quantity": qty,
                                                           "delivery_address": "Nassau"}).json()["id"]


def test_edit_request_details_and_quantity_reprices(u, monkeypatch):
    monkeypatch.setenv("EMAIL_REVIEW", "on")
    rid = _request(u)
    l1 = make_listing(u, rid, 100, "Chair A", "椅子 A")
    client.post(f"/admin/requests/{rid}/proposal", headers=u["admin"], json={"options": [{"listing_id": l1, **BASE}]})
    before = client.get(f"/admin/requests/{rid}", headers=u["admin"]).json()["quotes"][0]["total_bsd"]

    r = client.patch(f"/admin/requests/{rid}", headers=u["admin"], json={
        "product_name": "Ergonomic office chair", "quantity": 2, "delivery_address": "12 Bay St, Nassau",
        "target_price_bsd": 150})
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["product_name"] == "Ergonomic office chair" and v["quantity"] == 2 and v["target_price_bsd"] == 150
    assert v["delivery_address"] == "12 Bay St, Nassau"
    assert v["quotes"][0]["total_bsd"] > before  # re-priced for 2 chairs
    assert any("re-priced for quantity 2" in e["message"] for e in v["events"])
    # null clears the budget; the edit log is admin-only
    assert client.patch(f"/admin/requests/{rid}", headers=u["admin"],
                        json={"target_price_bsd": None}).json()["target_price_bsd"] is None
    cust = client.get(f"/requests/{rid}", headers=u["cust"]).json()
    assert not any("edited by admin" in e["message"] for e in cust["timeline"])
    assert client.patch(f"/admin/requests/{rid}", headers=u["cust"], json={"quantity": 9}).status_code == 403


def test_edit_sent_quote_then_chosen_quote_updates_invoice(u, monkeypatch):
    monkeypatch.setenv("EMAIL_REVIEW", "on")
    rid = _request(u, "Standing desk")
    l1 = make_listing(u, rid, 300, "Desk A", "桌子 A")
    l2 = make_listing(u, rid, 400, "Desk B", "桌子 B")
    l3 = make_listing(u, rid, 350, "Desk C", "桌子 C")
    client.post(f"/admin/requests/{rid}/proposal", headers=u["admin"],
                json={"options": [{"listing_id": l, **BASE} for l in (l1, l2)]})
    q1 = next(q for q in client.get(f"/admin/requests/{rid}", headers=u["admin"]).json()["quotes"]
              if q["option_number"] == 1)

    # preview changes nothing
    p = client.post(f"/admin/quotes/{q1['id']}/preview", headers=u["admin"], json={"freight_cost_bsd": 50})
    assert p.status_code == 200 and p.json()["total_bsd"] == pytest.approx(q1["total_bsd"] + 30)
    assert p.json()["before"]["total_bsd"] == q1["total_bsd"]
    same = next(q for q in client.get(f"/admin/requests/{rid}", headers=u["admin"]).json()["quotes"] if q["id"] == q1["id"])
    assert same["total_bsd"] == q1["total_bsd"] and same["freight_cost_bsd"] == 20

    # swap the product to an unused listing, raise freight, extend validity, tell the customer
    assert client.patch(f"/admin/quotes/{q1['id']}", headers=u["admin"], json={"listing_id": l2}).status_code == 400
    r = client.patch(f"/admin/quotes/{q1['id']}", headers=u["admin"],
                     json={"listing_id": l3, "freight_cost_bsd": 50, "valid_days": 14, "notify": True})
    assert r.status_code == 200, r.text
    v = r.json()
    q = next(x for x in v["quotes"] if x["id"] == q1["id"])
    assert q["listing_id"] == l3 and q["freight_cost_bsd"] == 50 and q["fx_cny_usd"] == 0.14
    assert q["total_bsd"] == pytest.approx((350 + 10) * 0.14 + 50 + max((350 + 10) * 0.14 * 0.12, 15), abs=0.01)
    chosen = {l["id"] for l in v["listings"] if l["is_chosen"]}
    assert chosen == {l2, l3}
    draft = [n for n in v["notifications"] if n["status"] == "draft" and "updated" in n["subject"]]
    assert draft and draft[0]["attachments"] == ["options_preview"]
    cust = client.get(f"/requests/{rid}", headers=u["cust"]).json()
    assert any("Option 1 has been updated" in e["message"] for e in cust["timeline"])
    assert "桌子" not in str(cust)

    # customer pays the report fee and chooses option 1; editing it updates the unpaid invoice
    client.post(f"/admin/requests/{rid}/report-fee", headers=u["admin"])
    assert client.post(f"/requests/{rid}/approve?quote_id={q1['id']}", headers=u["cust"]).status_code == 200
    inv = client.get(f"/requests/{rid}", headers=u["cust"]).json()["invoice"]
    r = client.patch(f"/admin/quotes/{q1['id']}", headers=u["admin"], json={"insurance_bsd": 5, "notify": True})
    assert r.status_code == 200, r.text
    new_total = next(x for x in r.json()["quotes"] if x["id"] == q1["id"])["total_bsd"]
    inv2 = client.get(f"/requests/{rid}", headers=u["cust"]).json()["invoice"]
    assert inv2["id"] == inv["id"] and inv2["amount_bsd"] == new_total == pytest.approx(inv["amount_bsd"] + 5)
    assert any(n["attachments"] == ["invoice"] for n in r.json()["notifications"] if n["status"] == "draft")
    # the option the customer didn't choose can't be edited any more
    q2 = next(x for x in r.json()["quotes"] if x["option_number"] == 2)
    assert client.patch(f"/admin/quotes/{q2['id']}", headers=u["admin"], json={"freight_cost_bsd": 1}).status_code == 400

    # once paid, the quote is locked
    client.post(f"/admin/invoices/{inv['id']}/mark-paid?reference=test", headers=u["admin"])
    assert client.patch(f"/admin/quotes/{q1['id']}", headers=u["admin"], json={"insurance_bsd": 0}).status_code == 400
    assert client.patch(f"/admin/requests/{rid}", headers=u["admin"], json={"quantity": 3}).status_code == 400


def test_edit_customer(u):
    cid = u["user"]["id"]
    r = client.patch(f"/admin/customers/{cid}", headers=u["admin"],
                     json={"name": "Kayla R. Rolle", "phone": "242 555 0199", "address": "5 Shirley St"})
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == "+1 242-555-0199" and r.json()["name"] == "Kayla R. Rolle"
    assert client.patch(f"/admin/customers/{cid}", headers=u["admin"], json={"email": "admin@aimoro.test"}).status_code == 400
    assert client.patch(f"/admin/customers/{cid}", headers=u["admin"], json={"phone": "123"}).status_code == 422
    assert client.patch(f"/admin/customers/{cid}", headers=u["cust"], json={"name": "x"}).status_code == 403


def test_exact_email_preview_with_attachments(u, monkeypatch):
    monkeypatch.setenv("EMAIL_REVIEW", "on")
    rid = _request(u, "Lamp")
    l1 = make_listing(u, rid, 80, "Lamp A", "灯 A")
    client.post(f"/admin/requests/{rid}/proposal", headers=u["admin"], json={"options": [{"listing_id": l1, **BASE}]})
    p = client.post("/admin/emails/preview", headers=u["admin"], json={
        "request_id": rid, "subject": "Your report", "body": "Hi **Kayla**\n\n* one",
        "attachments": ["options_preview", "invoice"]}).json()
    # invoice doesn't exist yet: preview still renders, with a warning
    assert p["to"] == client.get(f"/admin/requests/{rid}", headers=u["admin"]).json()["customer"]["email"]
    assert p["subject"] == "Your report" and "<strong>Kayla</strong>" in p["html"] and "Kayla" in p["text"]
    assert "AIMORO" in p["text"] and p["reply_to"]
    assert any("invoice" in w.lower() for w in p["warnings"])

    p = client.post("/admin/emails/preview", headers=u["admin"], json={
        "request_id": rid, "subject": "Your report", "body": "Hi", "attachments": ["options_preview"]}).json()
    assert [a["kind"] for a in p["attachments"]] == ["options_preview"]
    assert p["attachments"][0]["filename"].endswith("-preview.pdf") and p["attachments"][0]["size_bytes"] > 1000

    pdf = client.get(f"/admin/requests/{rid}/attachments/options_preview", headers=u["admin"])
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF" and "inline" in pdf.headers["content-disposition"]
    assert client.get(f"/admin/requests/{rid}/attachments/invoice", headers=u["admin"]).status_code == 400
    assert client.get(f"/admin/requests/{rid}/attachments/options_preview", headers=u["cust"]).status_code == 403

    # a draft previews to its own recipient
    d = next(n for n in client.get(f"/admin/requests/{rid}", headers=u["admin"]).json()["notifications"]
             if n["status"] == "draft")
    p = client.post("/admin/emails/preview", headers=u["admin"],
                    json={"notification_id": d["id"], "subject": d["subject"], "body": d["body"]}).json()
    assert p["to"] == d["to_address"]
