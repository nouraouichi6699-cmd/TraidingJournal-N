from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/opt/pw-browsers/chromium" if False else None)
    pg=b.new_page(viewport={"width":1300,"height":900})
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto("http://localhost:5199/h/index.html"); pg.wait_for_timeout(1500)
    pg.screenshot(path="/tmp/d1.png")
    pg.get_by_role("button",name="Customize").click(); pg.wait_for_timeout(300)
    card=pg.locator("div[style*='cursor']").first
    box=pg.locator("div.cursor-grab").first.bounding_box()
    pg.mouse.move(box["x"]+60,box["y"]+30); pg.mouse.down(); pg.mouse.move(box["x"]+300,box["y"]+210,steps=8)
    pg.screenshot(path="/tmp/d2.png"); pg.mouse.up()
    b2=pg.locator("div.cursor-grab").first.bounding_box()
    pg.mouse.move(b2["x"]+b2["width"],b2["y"]+b2["height"]); pg.mouse.down(); pg.mouse.move(b2["x"]+b2["width"]+120,b2["y"]+b2["height"]+90,steps=8); pg.mouse.up()
    pg.screenshot(path="/tmp/d3.png")
    print(b2, pg.locator("div.cursor-grab").first.bounding_box(), errs)
