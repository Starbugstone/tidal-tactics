// Atlas rows are characters, columns are poses. Every cell shares a foot anchor.
export const bossSheets = ['anim-tide', 'anim-ash', 'anim-rime'];

function paintCell(ctx, atlas, columns, row, column, size) {
  const cell = atlas.width / columns;
  ctx.drawImage(atlas, column * cell, row * cell, cell, cell,
    -size / 2, -size, size, size);
}

export function enemyRow(unit) {
  return unit.kind === 'brute' ? 2 : unit.id % 2;
}

export function threatHeight(kind, projection, canvasHeight) {
  if (kind === 'boss') return Math.min(4.8 * projection, canvasHeight * .41);
  return projection * (kind === 'brute' ? 2.05 : 1.45);
}

export function drawThreat(field, unit, pos, height) {
  const c = field.c, boss = unit.kind === 'boss';
  const sheet = boss ? bossSheets[field.index] : 'anim-infected';
  const phase = unit.phase, stride = Math.floor(phase * 2 / Math.PI) % 4;
  let row = boss ? 0 : enemyRow(unit), col = stride;
  let lift = Math.abs(Math.sin(phase)) * height * (boss ? .036 : .076);
  let tilt = Math.sin(phase) * (boss ? .035 : .083);
  let flip = stride >= 2;
  const attacking = boss && (unit.windup > 0 || unit.recovery > 0);
  if (attacking) {
    row = 1;
    col = unit.windup > 0 ? (unit.windup < .32 ? 0 : 1) : (unit.recovery > .26 ? 2 : 3);
    lift = unit.windup > .80 ? Math.sin((unit.windup - .80) * Math.PI / .20) * height * .08 : 0;
    tilt = 0;
    flip = false;
  }
  const recoil = Math.max(0, 1 - (field.battleTime - (unit.recoilAt ?? -1)) / .17);
  const kick = attacking ? 0 : Math.sin(recoil * Math.PI);
  const side = unit.id % 2 ? 1 : -1;
  field.shadow(pos.x, pos.y, height * (boss ? .35 : .24), height * .085, boss ? .38 : .25);
  c.save();
  c.translate(pos.x + kick * height * .055 * side, pos.y - lift);
  c.rotate(tilt + kick * side * (boss ? .022 : .14));
  c.scale(flip ? -1 : 1, 1 - kick * .056);
  const image = recoil > .78 ? field.flashArt[sheet] : field.art[sheet];
  paintCell(c, image, 4, row, col, height / (boss ? .74 : .78));
  c.restore();
}

export function drawFallen(field, body) {
  const { c } = field, p = field.project(body.x, body.d);
  const boss = body.kind === 'boss', ally = body.kind === 'marine';
  const duration = boss ? 1.35 : .68;
  const progress = Math.min(1, body.age / duration);
  const col = progress < .20 ? 0 : progress < .48 ? 1 : 2;
  const height = ally ? p.s * 1.22 : threatHeight(body.kind, p.s, field.h);
  const sheet = boss ? 'anim-bossfall' : ally ? 'anim-squadfall' : 'anim-infectedfall';
  const row = boss ? field.index : ally ? body.tier : enemyRow(body);
  const roll = Math.sin(progress * Math.PI);
  c.save();
  c.globalAlpha = Math.min(1, (1 - progress) / .32);
  field.shadow(p.x, p.y, height * (.29 + progress * .16), height * .08);
  c.translate(p.x + body.side * height * .17 * progress, p.y - height * roll * .10);
  c.rotate(body.side * .12 * roll);
  c.scale(body.side, 1);
  paintCell(c, field.art[sheet], 3, row, col, height / .76);
  c.restore();
}
