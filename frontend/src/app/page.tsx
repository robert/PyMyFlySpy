'use client'

import InteractiveWorldMap from '@/app/components/InteractiveWorldMap';
import worldData from '@/app/data/world.json';

export default function Home() {
  return (
    <main>
      <InteractiveWorldMap worldData={worldData} />
    </main>
  );
}