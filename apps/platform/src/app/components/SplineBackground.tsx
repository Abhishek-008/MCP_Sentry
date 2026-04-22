'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
    </div>
  ),
});

export default function SplineBackground() {
  return (
    <Spline scene="https://prod.spline.design/UjPegGRxIGhMNnny/scene.splinecode" />
  );
}
