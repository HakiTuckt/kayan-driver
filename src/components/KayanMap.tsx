import { useState } from 'react';
import { Car, LocateFixed, Minus, Plus, ShieldCheck } from 'lucide-react';

export default function KayanMap({ hasRoute, destination }: { hasRoute: boolean; destination: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="relative min-h-[330px] w-full overflow-hidden rounded-2xl bg-[#103b2e] lg:h-full lg:min-h-[610px]">
      <svg viewBox="0 0 900 760" role="img" aria-label="Illustrative Lusaka map, not a live navigation map" className="absolute inset-0 h-full w-full object-cover" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="blocks" width="100" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)"><path d="M0 0H100V90H0Z M30 0V90 M65 0V90 M0 40H100" fill="none" stroke="#2c5140" strokeWidth="1"/><path d="M5 5H25V34H5Z M36 48H59V82H36Z M70 7H94V32H70Z" fill="#194431"/></pattern>
        </defs>
        <rect width="900" height="760" fill="#103b2e" />
        <g transform={`translate(450 380) scale(${zoom}) translate(-450 -380)`}>
          <rect x="-400" y="-400" width="1700" height="1600" fill="url(#blocks)"/>
          <path d="M600 0Q565 80 620 160L760 190 805 110 770 0Z M15 530L110 490 175 530 120 650 0 700Z M640 580L715 520 860 600 890 740 690 760Z" fill="#214b36"/>
          <g fill="none" stroke="#45634b" strokeWidth="5"><path d="M-30 210L205 150 440 215 630 100 920 180"/><path d="M100 -20L200 240 270 400 240 610 330 800"/><path d="M460 -20L440 215 475 460 600 800"/><path d="M750 -20L630 220 690 470 650 800"/><path d="M0 580L240 610 475 460 690 470 940 400"/><path d="M0 330L270 400 420 350 720 330 930 260"/></g>
          <g fill="none" stroke="#9a997b" strokeWidth="8" strokeLinejoin="round"><path d="M-30 480L190 440 290 335 445 285 660 180 930 155"/><path d="M335 -20L355 190 445 285 480 445 590 555 625 800"/><path d="M-20 700L290 625 480 445 725 510 930 570"/></g>
          <g fill="#a1b5a2" fontSize="12" className="map-label"><text x="70" y="105">GARDEN</text><text x="410" y="130">OLYMPIA PARK</text><text x="675" y="285">KALUNDU</text><text x="105" y="320">NORTHMEAD</text><text x="340" y="430">RHODES PARK</text><text x="120" y="555">MALUBA</text><text x="620" y="415">LONGACRES</text><text x="540" y="650">WOODLANDS</text><text x="220" y="700">KABWATA</text></g>
          <g fill="#c4c7ad" fontSize="10"><text x="455" y="264" transform="rotate(-26 455 264)">Great East Road</text><text x="475" y="365" transform="rotate(78 475 365)">Addis Ababa Drive</text><text x="500" y="470" transform="rotate(15 500 470)">Independence Avenue</text><text x="70" y="450" transform="rotate(-10 70 450)">Manda Hill Road</text></g>
          {hasRoute && <path d="M390 350L420 303 445 285 530 245 580 220" fill="none" stroke="#e79049" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>}
          <circle cx="390" cy="350" r="32" fill="#d87932" opacity=".13"/><circle cx="390" cy="350" r="19" fill="#d87932" opacity=".18"/><circle cx="390" cy="350" r="8" fill="#fff3df" stroke="#d87932" strokeWidth="4"/>
          {hasRoute && <g><circle cx="580" cy="220" r="13" fill="#d87932" stroke="#fff3df" strokeWidth="3"/><circle cx="580" cy="220" r="4" fill="#fff3df"/></g>}
          <g fill="#dae2d6" stroke="#103b2e" strokeWidth="2"><rect x="305" y="264" width="12" height="24" rx="5" transform="rotate(45 311 276)"/><rect x="545" y="417" width="12" height="24" rx="5" transform="rotate(-70 551 429)"/><rect x="240" y="472" width="12" height="24" rx="5" transform="rotate(35 246 484)"/><rect x="638" y="285" width="12" height="24" rx="5"/></g>
        </g>
      </svg>
      <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-white/15 bg-[#062d24]/90 px-3.5 py-2 text-xs text-[#fff3df]"><span className="h-1.5 w-1.5 rounded-full bg-[#d87932]"/> Lusaka, Zambia <span className="text-[#b8c9b8]">· Illustrative map</span></div>
      <div className="absolute right-4 top-20 flex flex-col gap-2">
        <button className="map-control" aria-label="Reset map view" onClick={() => setZoom(1)}><LocateFixed size={18}/></button>
        <button className="map-control" aria-label="Zoom in" disabled={zoom >= 1.8} onClick={() => setZoom(z => Math.min(1.8, z + .2))}><Plus size={18}/></button>
        <button className="map-control" aria-label="Zoom out" disabled={zoom <= .8} onClick={() => setZoom(z => Math.max(.8, z - .2))}><Minus size={18}/></button>
      </div>
      <div className="absolute left-[37%] top-[48%] rounded-xl bg-[#fff8eb] px-3 py-2 text-xs font-semibold text-[#163b2c] shadow-xl"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary"/> {hasRoute ? 'Your pickup' : 'You are here'}<span className="mt-1 block text-[10px] font-normal text-muted-foreground">Rhodes Park · Demo location</span></div>
      {hasRoute && <div className="absolute left-[56%] top-[24%] max-w-[160px] rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white">{destination}</div>}
      <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-[#062d24]/95 p-3.5 text-[#fff3df]">
        <div className="flex items-center gap-3"><div className="rounded-lg bg-white/10 p-2"><ShieldCheck size={19} className="text-[#e99755]"/></div><div><p className="text-xs font-semibold">A better way to get there.</p><p className="mt-0.5 text-[10px] text-[#b8c9b8]">Clean cars. Professional service. Peace of mind.</p></div></div><Car className="hidden text-[#b8c9b8] sm:block" size={22}/>
      </div>
    </div>
  );
}
