import * as React from 'react'
import { cn } from '@/lib/utils'

export interface CpuArchitectureSvgProps {
  className?: string
  width?: string
  height?: string
  text?: string
  showCpuConnections?: boolean
  lineMarkerSize?: number
  animateText?: boolean
  animateLines?: boolean
  animateMarkers?: boolean
}

export function CpuArchitecture({
  className,
  width = '100%',
  height = '100%',
  text = 'CAP',
  showCpuConnections = true,
  animateText = true,
  lineMarkerSize = 18,
  animateLines = true,
  animateMarkers = true,
}: CpuArchitectureSvgProps) {
  return (
    <svg
      className={cn('text-subtle', className)}
      width={width}
      height={height}
      viewBox="0 0 200 100"
    >
      <g
        stroke="currentColor"
        fill="none"
        strokeWidth="0.3"
        strokeDasharray="100 100"
        pathLength="100"
        markerStart="url(#cpu-circle-marker)"
      >
        <path strokeDasharray="100 100" pathLength="100" d="M 10 20 h 79.5 q 5 0 5 5 v 30" />
        <path strokeDasharray="100 100" pathLength="100" d="M 180 10 h -69.7 q -5 0 -5 5 v 30" />
        <path d="M 130 20 v 21.8 q 0 5 -5 5 h -10" />
        <path d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50" />
        <path
          strokeDasharray="100 100"
          pathLength="100"
          d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20"
        />
        <path d="M 94.8 95 v -36" />
        <path d="M 88 88 v -15 q 0 -5 -5 -5 h -10 q -5 0 -5 -5 v -5 q 0 -5 5 -5 h 14" />
        <path d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20" />
        {animateLines && (
          <animate
            attributeName="stroke-dashoffset"
            from="100"
            to="0"
            dur="1s"
            fill="freeze"
            calcMode="spline"
            keySplines="0.25,0.1,0.5,1"
            keyTimes="0; 1"
          />
        )}
      </g>

      <g mask="url(#cpu-mask-1)">
        <circle className="cpu-architecture cpu-line-1" cx="0" cy="0" r="8" fill="url(#cpu-blue-grad)" />
      </g>
      <g mask="url(#cpu-mask-2)">
        <circle className="cpu-architecture cpu-line-2" cx="0" cy="0" r="8" fill="url(#cpu-cyan-grad)" />
      </g>
      <g mask="url(#cpu-mask-3)">
        <circle className="cpu-architecture cpu-line-3" cx="0" cy="0" r="8" fill="url(#cpu-pinkish-grad)" />
      </g>
      <g mask="url(#cpu-mask-4)">
        <circle className="cpu-architecture cpu-line-4" cx="0" cy="0" r="8" fill="url(#cpu-white-grad)" />
      </g>
      <g mask="url(#cpu-mask-5)">
        <circle className="cpu-architecture cpu-line-5" cx="0" cy="0" r="8" fill="url(#cpu-pulse-grad)" />
      </g>
      <g mask="url(#cpu-mask-6)">
        <circle className="cpu-architecture cpu-line-6" cx="0" cy="0" r="8" fill="url(#cpu-orange-grad)" />
      </g>
      <g mask="url(#cpu-mask-7)">
        <circle className="cpu-architecture cpu-line-7" cx="0" cy="0" r="8" fill="url(#cpu-cyan-grad)" />
      </g>
      <g mask="url(#cpu-mask-8)">
        <circle className="cpu-architecture cpu-line-8" cx="0" cy="0" r="8" fill="url(#cpu-blue-grad)" />
      </g>

      <g>
        {showCpuConnections && (
          <g fill="url(#cpu-connection-gradient)">
            <rect x="93" y="37" width="2.5" height="5" rx="0.7" />
            <rect x="104" y="37" width="2.5" height="5" rx="0.7" />
            <rect x="116.3" y="44" width="2.5" height="5" rx="0.7" transform="rotate(90 116.25 45.5)" />
            <rect x="122.8" y="44" width="2.5" height="5" rx="0.7" transform="rotate(90 116.25 45.5)" />
            <rect x="104" y="16" width="2.5" height="5" rx="0.7" transform="rotate(180 105.25 39.5)" />
            <rect x="114.5" y="16" width="2.5" height="5" rx="0.7" transform="rotate(180 105.25 39.5)" />
            <rect x="80" y="-13.6" width="2.5" height="5" rx="0.7" transform="rotate(270 115.25 19.5)" />
            <rect x="87" y="-13.6" width="2.5" height="5" rx="0.7" transform="rotate(270 115.25 19.5)" />
          </g>
        )}
        <rect x="85" y="40" width="30" height="20" rx="2" fill="#0A0F1F" filter="url(#cpu-light-shadow)" />
        <text
          x="89.5"
          y="52.5"
          fontSize="7"
          fill={animateText ? 'url(#cpu-text-gradient)' : 'white'}
          fontWeight="700"
          letterSpacing="0.05em"
        >
          {text}
        </text>
      </g>

      <defs>
        <mask id="cpu-mask-1"><path d="M 10 20 h 79.5 q 5 0 5 5 v 24" strokeWidth="0.5" stroke="white" /></mask>
        <mask id="cpu-mask-2"><path d="M 180 10 h -69.7 q -5 0 -5 5 v 24" strokeWidth="0.5" stroke="white" /></mask>
        <mask id="cpu-mask-3"><path d="M 130 20 v 21.8 q 0 5 -5 5 h -10" strokeWidth="0.5" stroke="white" /></mask>
        <mask id="cpu-mask-4"><path d="M 170 80 v -21.8 q 0 -5 -5 -5 h -50" strokeWidth="0.5" stroke="white" /></mask>
        <mask id="cpu-mask-5"><path d="M 135 65 h 15 q 5 0 5 5 v 10 q 0 5 -5 5 h -39.8 q -5 0 -5 -5 v -20" strokeWidth="0.5" stroke="white" /></mask>
        <mask id="cpu-mask-6"><path d="M 94.8 95 v -36" strokeWidth="0.5" stroke="white" /></mask>
        <mask id="cpu-mask-7"><path d="M 88 88 v -15 q 0 -5 -5 -5 h -10 q -5 0 -5 -5 v -5 q 0 -5 5 -5 h 14" strokeWidth="0.5" stroke="white" /></mask>
        <mask id="cpu-mask-8"><path d="M 30 30 h 25 q 5 0 5 5 v 6.5 q 0 5 5 5 h 20" strokeWidth="0.5" stroke="white" /></mask>

        <radialGradient id="cpu-blue-grad" fx="1">
          <stop offset="0%" stopColor="#2F6BFF" />
          <stop offset="50%" stopColor="#1A4DD4" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-cyan-grad" fx="1">
          <stop offset="0%" stopColor="#38D6FF" />
          <stop offset="50%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-pulse-grad" fx="1">
          <stop offset="0%" stopColor="#00FFB7" />
          <stop offset="50%" stopColor="#10B981" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-pinkish-grad" fx="1">
          <stop offset="0%" stopColor="#A855F7" />
          <stop offset="50%" stopColor="#EC4899" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-white-grad" fx="1">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="cpu-orange-grad" fx="1">
          <stop offset="0%" stopColor="#FFB347" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>

        <filter id="cpu-light-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#38D6FF" floodOpacity="0.4" />
        </filter>

        <marker
          id="cpu-circle-marker"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth={lineMarkerSize}
          markerHeight={lineMarkerSize}
        >
          <circle cx="5" cy="5" r="2" fill="#0A0F1F" stroke="#38D6FF" strokeWidth="0.5">
            {animateMarkers && <animate attributeName="r" values="0; 3; 2" dur="0.5s" />}
          </circle>
        </marker>

        <linearGradient id="cpu-connection-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38D6FF" />
          <stop offset="60%" stopColor="#1F2A40" />
        </linearGradient>

        <linearGradient id="cpu-text-gradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#64748B">
            <animate attributeName="offset" values="-2; -1; 0" dur="5s" repeatCount="indefinite" calcMode="spline" keyTimes="0; 0.5; 1" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
          </stop>
          <stop offset="25%" stopColor="#38D6FF">
            <animate attributeName="offset" values="-1; 0; 1" dur="5s" repeatCount="indefinite" calcMode="spline" keyTimes="0; 0.5; 1" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
          </stop>
          <stop offset="50%" stopColor="#64748B">
            <animate attributeName="offset" values="0; 1; 2;" dur="5s" repeatCount="indefinite" calcMode="spline" keyTimes="0; 0.5; 1" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1" />
          </stop>
        </linearGradient>
      </defs>
    </svg>
  )
}
