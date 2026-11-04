import * as SliderPrimitive from '@radix-ui/react-slider';
import { forwardRef, useState, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '../lib/cn';

/*
 * One value on a square track. The thumb's own box is 44px, the target, with
 * the 18px square drawn in its middle; the track and the ticks are inset by
 * half a thumb, so the drawn square's centre, the fill's end and a tick meet
 * at every value. The root is a thumb tall, so a press anywhere in that band
 * lands on it.
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
                {/* Radix keeps the 44px thumb inside the root, so its centre runs from 22px to the width less 22px: the track does too. */}
                <SliderPrimitive.Track className="relative mx-[1.375rem] h-1 grow overflow-hidden bg-border">
                    {/* The fill is the state: the display accent clears 3:1 on every ground (a band re-points it). */}
                    <SliderPrimitive.Range data-slider-fill="" className="absolute h-full bg-oca-accent-display" />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb
                    aria-label={ariaLabel}
                    aria-labelledby={labelledBy}
                    aria-valuetext={valueText(shown)}
                    data-slider-thumb=""
                    className="group flex size-11 items-center justify-center outline-none"
                >
                    <span
                        aria-hidden
                        className="block size-[1.125rem] border-2 border-oca-accent-display bg-[var(--oca-ground,var(--background))] transition-[background-color] group-focus-visible:[outline:2px_solid_var(--ring)] group-focus-visible:outline-offset-4"
                    />
                </SliderPrimitive.Thumb>
            </SliderPrimitive.Root>
            {marks && marks.length > 0 ? (
                <div aria-hidden className="pointer-events-none relative mt-0.5 h-4">
                    {marks.map((m) => (
                        <span
                            key={m.value}
                            // Each centres on where the thumb's square sits at its value.
                            className="absolute top-0 -translate-x-1/2 whitespace-nowrap font-mono text-[0.75rem] leading-none text-muted-foreground"
                            style={{ left: `calc(1.375rem + ${at(m.value) / 100} * (100% - 2.75rem))` }}
                        >
                            {m.label}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
});
