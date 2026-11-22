const urls=import.meta.glob('./art/game/*.webp',{eager:true,query:'?url',import:'default'});
export const assetUrls=Object.fromEntries(Object.entries(urls).map(([path,url])=>[path.split('/').pop().replace('.webp',''),url]));
export const gearKeys=['rifle','twin','vulcan','rocket'];
export async function loadArt(){
  const entries=await Promise.all(Object.entries(assetUrls).map(async([key,url])=>{
    const img=new Image();img.src=url;await img.decode();return [key,img];
  }));
  return Object.fromEntries(entries);
}
