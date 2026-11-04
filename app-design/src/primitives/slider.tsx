import * as SliderPrimitive from '@radix-ui/react-slider';
import { forwardRef, useState, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '../lib/cn';

/*
 * One value on a square track. The thumb is drawn 18px and pressed in 44px:
 * the root is a thumb tall, so a press anywhere in that band lands on it.
 * A screen reader hears the value in words ("100,000 sats", "30 days"),
 * never a bare index. It reads the ground's tokens, so on an ink or burnt
 * band it takes the band's colours; the thumb is filled with --oca-ground
 * where a block sets it, else the page.
 */

export interface SliderMark {
    value: number;
    label: string;
}

export interface SliderProps
    extends Omit<ComponentPropsWithoutRef<typeof SliderPrimitive.Root>, 'value' | 'defaultValue' | 'onValueChange' | 'onValueCommit'> {
    value?: number;
    defaultValue?: number;
    onValueChange?: (value: number) => void;
    onValueCommit?: (value: number) => void;
    /** The value in words, read out by a screen reader. */
    valueText: (value: number) => string;
    /** Its name, when no visible label names it through `aria-labelledby`. */
    'aria-label'?: string;
    'aria-labelledby'?: string;
    /** Ticks under the track. Shown to the eye only; the value text says the same. */
    marks?: SliderMark[];
}

export const Slider = forwardRef<ElementRef<typeof SliderPrimitive.Root>, SliderProps>(function Slider(
    {
        value,
        defaultValue,
        onValueChange,
        onValueCommit,
        valueText,
        marks,
        min = 0,
        max = 100,
        className,
        'aria-label': ariaLabel,
        'aria-labelledby': labelledBy,
        ...props
    },
    ref
) {
    // Uncontrolled, the words still follow the thumb.
    const [inner, setInner] = useState(defaultValue ?? min);
    const shown = value ?? inner;
    const at = (v: number) => (max === min ? 0 : ((v - min) / (max - min)) * 100);
    return (
        <div className={cn('flex w-full flex-col', className)}>
            <SliderPrimitive.Root
                ref={ref}
                min={min}
                max={max}
                value={value === undefined ? undefined : [value]}
                defaultValue={defaultValue === undefined ? undefined : [defaultValue]}
                onValueChange={(v) => {
                    setInner(v[0] ?? min);
                    onValueChange?.(v[0] ?? min);
                }}
                onValueCommit={onValueCommit ? (v) => onValueCommit(v[0] ?? min) : undefined}
                data-slider=""
                className="relative flex h-11 w-full touch-none select-none items-center data-[disabled]:opacity-50"
                {...props}
            >
                <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden bg-border">
                    {/* The fill is the state: the display accent clears 3:1 on every ground (a band re-points it). */}
                    <SliderPrimitive.Range className="absolute h-full bg-oca-accent-display" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                    aria-label={ariaLabel}
                    aria-labelledby={labelledBy}
                    aria-valuetext={valueText(shown)}
                    className={cn(
                        'relative block size-[1.125rem] border-2 transition-[background-color]',
                        // A thumb's 44px, centred on what it draws.
                        'before:absolute before:-inset-[0.8125rem] before:content-[""]',
                        'border-oca-accent-display bg-[var(--oca-ground,var(--background))] focus-visible:[outline:2px_solid_var(--ring)] focus-visible:outline-offset-4'
                    )}
                />
            </SliderPrimitive.Root>
            {marks && marks.length > 0 ? (
                <div aria-hidden className="pointer-events-none relative mt-0.5 h-4">
                    {marks.map((m, i) => (
                        <span
                            key={m.value}
                            className={cn(
                                'absolute top-0 whitespace-nowrap font-mono text-[0.75rem] leading-none text-muted-foreground',
                                // The ends sit inside the track; the rest centre on their value.
                                i === 0 ? '' : i === marks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
                            )}
                            style={{ left: `${at(m.value)}%` }}
                        >
                            {m.label}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
});
