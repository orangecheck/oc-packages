import { cn } from '../tokens/cn';

export interface SparklineProps {
    data: ReadonlyArray<number>;
    width?: number;
    height?: number;
    className?: string;
    /** Render a soft area-fill under the line. */
    area?: boolean;
}

/**
 * Tiny inline SVG sparkline. No library — keeps the bundle small and the look
 * consistent with the cypherpunk family aesthetic. Degenerates gracefully to a
 * flat line for empty/single-point data.
 */
export function Sparkline({ data, width = 96, height = 24, area = false, className }: SparklineProps) {
    if (data.length === 0) {
        return (
            <svg width={width} height={height} className={cn(className)} aria-hidden>
                <line
                    x1={0}
                    x2={width}
                    y1={height / 2}
                    y2={height / 2}
                    stroke="currentColor"
                    strokeWidth={1}
                    opacity={0.25}
                />
            </svg>
        );
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = data.length === 1 ? width : width / (data.length - 1);

    const points = data.map((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / range) * (height - 2) - 1;
        return [x, y] as const;
    });

    const linePath = points
        .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
        .join(' ');

    const areaPath = area
        ? `${linePath} L${width.toFixed(2)},${height.toFixed(2)} L0,${height.toFixed(2)} Z`
        : null;

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={cn('text-primary', className)}
            aria-hidden
        >
            {areaPath && <path d={areaPath} fill="currentColor" opacity={0.12} />}
            <path d={linePath} fill="none" stroke="currentColor" strokeWidth={1.25} />
        </svg>
    );
}
