import { test, expect } from '@playwright/test';
test('real 3D follow, boosts, crown, podium and automatic next round',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/demo');
 await expect(page.locator('canvas')).toBeVisible();
 await expect(page.getByText('العالم يحتاج WebGL 2')).toHaveCount(0);
 await page.getByLabel('اسم المتحدّي').fill('محمد');
 await page.getByRole('button',{name:'＋ Follow — ادخل التحدّي ↗'}).click();
 const avatar=page.locator('[data-viewer="mock:محمد"]');
 await expect(avatar).toBeVisible();
 await expect.poll(async()=>Number(await avatar.getAttribute('data-progress'))).toBeGreaterThan(0);
 const before=Number(await avatar.getAttribute('data-progress'));
 await page.getByRole('button',{name:'✿ Rose دفعة صغيرة'}).click();
 await expect.poll(async()=>Number(await avatar.getAttribute('data-progress'))).toBeGreaterThan(before+.019);
 const rose=Number(await avatar.getAttribute('data-progress'));
 await page.getByRole('button',{name:'↟ Rocket انطلاقة صاروخية'}).click();
 await expect.poll(async()=>Number(await avatar.getAttribute('data-progress'))).toBeGreaterThan(rose+.14);
 await page.screenshot({path:'artifacts/demo-desktop.png',fullPage:true});
 const firstRound=await page.getByTestId('game-stage').getAttribute('data-round');
 await expect(page.locator('.king-banner')).toBeVisible({timeout:180000});
 await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase','PODIUM',{timeout:190000});
 await page.screenshot({path:'artifacts/podium.png',fullPage:true});
 await expect.poll(async()=>await page.getByTestId('game-stage').getAttribute('data-round'),{timeout:20000}).not.toBe(firstRound);
 await page.setViewportSize({width:1080,height:1920});
 await page.goto('/play');
 await expect(page.locator('canvas')).toBeVisible();
 const bounds=await page.getByTestId('game-stage').boundingBox();
 expect(bounds?.width).toBe(1080);expect(bounds?.height).toBe(1920);
 await page.screenshot({path:'artifacts/play-1080x1920.png'});
 expect(errors).toEqual([]);
});
test('all five worlds, mobile layout and dashboard controls',async({page})=>{
 await page.goto('/dashboard/customize');
 for(const [index,name] of ['ليالي الرياض','الدرعية','العُلا','واحة السماء','المستقبل 966'].entries()){
  await page.getByRole('button').filter({hasText:name}).click();
  await page.goto('/play');await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({path:`artifacts/world-${index}.png`});
  await page.goto('/dashboard/customize');
 }
 await page.setViewportSize({width:390,height:844});await page.goto('/demo');
 await expect(page.getByRole('button',{name:'＋ Follow — ادخل التحدّي ↗'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
 await page.screenshot({path:'artifacts/demo-mobile.png',fullPage:true});
 await page.goto('/dashboard/leaderboard');await expect(page.locator('table')).toBeVisible();
});
