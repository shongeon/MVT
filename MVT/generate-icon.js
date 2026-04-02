import { Jimp } from 'jimp';

async function createIcon() {
  const image = new Jimp({ width: 192, height: 192, color: '#000000' });
  await image.write('public/icon-192.png');
  console.log('Icon created');
}

createIcon();
