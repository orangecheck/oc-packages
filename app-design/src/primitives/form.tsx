import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Check, ChevronDown } from 'lucide-react';
import {
    cloneElement,
    forwardRef,
    isValidElement,
    useContext,
    useId,
    type ComponentPropsWithoutRef,
    type ElementRef,
    type InputHTMLAttributes,
    type ReactElement,
    type ReactNode,
    type TextareaHTMLAttributes,
} from 'react';

import { cn } from '../lib/cn';
import { useDensity } from '../lib/density';
import { sharedContext } from '../lib/shared-context';

/* Fields: 44px tall, a hairline that darkens on focus with a soft orange halo,
   16px text on phones so iOS never zooms. */
const fieldBase = [
    'w-full rounded-xl border border-input bg-card text-foreground placeholder:text-oca-subtle',
    'text-base md:text-[0.9375rem] outline-none transition-[border-color,box-shadow]',
    // The focus look is theme.css's [data-oca-field] rule, so a field styled inline can wear it too.
    'disabled:cursor-not-allowed disabled:opacity-55',
    'aria-[invalid=true]:border-destructive',
];

/* `sm` is 36px for a tool's dense forms, 44px to a thumb like the buttons; the text stays 16px on phones. */
const FIELD_SIZE = {
    md: 'h-11 px-3.5',
    sm: 'h-9 rounded-[0.625rem] px-3 pointer-coarse:h-11 md:text-[0.875rem]',
} as const;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
    /** `sm` (36px, 44px on touch) for a tool's dense forms. Defaults to the density around it. */
    size?: 'md' | 'sm';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { className, type = 'text', size, ...props },
    ref
) {
    const density = useDensity();
    const s = size ?? (density === 'compact' ? 'sm' : 'md');
    return (
        <input
            ref={ref}
            type={type}
            data-ui="input"
            data-oca-field=""
            data-size={s}
            className={cn(fieldBase, FIELD_SIZE[s], className)}
            {...props}
        />
    );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
    function Textarea({ className, ...props }, ref) {
        return (
            <textarea
                ref={ref}
                data-ui="textarea"
                data-oca-field=""
                className={cn(fieldBase, 'min-h-28 px-3.5 py-3 leading-relaxed', className)}
                {...props}
            />
        );
    }
);

export const Label = forwardRef<
    ElementRef<typeof LabelPrimitive.Root>,
    ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
    return (
        <LabelPrimitive.Root
            ref={ref}
            className={cn('text-sm font-medium leading-none text-foreground', className)}
            {...props}
        />
    );
});

/** What Field hands its control: the id its label names, its hint and error, whether it is invalid. */
export interface FieldControlProps {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
}

export interface FieldProps {
    label: ReactNode;
    /** Help under the control. It sits below, so paired fields stay level. */
    hint?: ReactNode;
    /** Mark the field optional beside its label, rather than in a hint. */
    optional?: boolean;
    /** Shown in place of nothing; marks the control invalid. */
    error?: ReactNode;
    /**
     * The control, which receives id, aria-describedby and aria-invalid. Or a
     * function given them, for a control inside a box of its own: an input
     * with a popover anchored under it, `(c) => <div className="relative"><Input {...c} />{popover}</div>`.
     */
    children: ReactElement | ((control: FieldControlProps) => ReactNode);
    /** The control's id, when something else must know it. Default: a generated one. */
    id?: string;
    className?: string;
    /** Render the label visually hidden (it is still the accessible name). */
    hideLabel?: boolean;
    /** A button that acts on the control, set beside it (below it on a phone). */
    action?: ReactNode;
}

/** Label, hint, control and error, wired together by id. */
export function Field({ label, hint, optional, error, children, id: fixedId, className, hideLabel, action }: FieldProps) {
    const generated = useId();
    const id = fixedId ?? generated;
    const hintId = hint ? `${id}-hint` : undefined;
    const errorId = error ? `${id}-error` : undefined;
    const wiring: FieldControlProps = {
        id,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
    };
    const control =
        typeof children === 'function'
            ? children(wiring)
            : isValidElement(children)
              ? cloneElement(children as ReactElement<Record<string, unknown>>, { ...wiring })
              : children;
    const hintNode = hint ? (
        <p id={hintId} className="text-[0.8125rem] leading-snug text-muted-foreground">
            {hint}
        </p>
    ) : null;
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <Label htmlFor={id} className={hideLabel ? 'sr-only' : 'flex items-baseline gap-2'}>
                {label}
                {optional ? <span className="text-[0.8125rem] font-normal text-muted-foreground">Optional</span> : null}
            </Label>
            {action ? (
                // The hint belongs to the input, so it sits under the input, not under the button.
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 flex-1 flex-col gap-2 [&>input]:w-full">
                        {control}
                        {hintNode}
                    </div>
                    <div className="shrink-0">{action}</div>
                </div>
            ) : (
                <>
                    {control}
                    {hintNode}
                </>
            )}
            {error ? (
                <p id={errorId} role="alert" className="text-[0.8125rem] leading-snug text-destructive">
                    {error}
                </p>
            ) : null}
        </div>
    );
}

/* ── Select ───────────────────────────────────────────────────────────── */

/*
 * Field wires its label to its child by id, and Select's root renders no
 * element of its own. So Select takes the field's id, description and
 * invalid state and hands them to its trigger, the element a label names.
 */
interface SelectWiring {
    id?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
}
const SelectFieldContext = sharedContext<SelectWiring | null>('select-field', null);

export function Select({
    id,
    'aria-describedby': describedBy,
    'aria-invalid': invalid,
    ...props
}: ComponentPropsWithoutRef<typeof SelectPrimitive.Root> & SelectWiring) {
    return (
        <SelectFieldContext.Provider value={{ id, 'aria-describedby': describedBy, 'aria-invalid': invalid }}>
            <SelectPrimitive.Root {...props} />
        </SelectFieldContext.Provider>
    );
}
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = forwardRef<
    ElementRef<typeof SelectPrimitive.Trigger>,
    ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { size?: 'md' | 'sm' }
>(function SelectTrigger({ className, children, size, ...props }, ref) {
    const density = useDensity();
    const field = useContext(SelectFieldContext);
    const s = size ?? (density === 'compact' ? 'sm' : 'md');
    return (
        <SelectPrimitive.Trigger
            ref={ref}
            id={field?.id}
            aria-describedby={field?.['aria-describedby']}
            aria-invalid={field?.['aria-invalid']}
            data-oca-field=""
            className={cn(fieldBase, FIELD_SIZE[s], 'flex items-center justify-between gap-2 text-left', className)}
            {...props}
        >
            <span className="truncate">{children}</span>
            <SelectPrimitive.Icon asChild>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
    );
});

export const SelectContent = forwardRef<
    ElementRef<typeof SelectPrimitive.Content>,
    ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, position = 'popper', ...props }, ref) {
    return (
        <SelectPrimitive.Portal>
            <SelectPrimitive.Content
                ref={ref}
                position={position}
                sideOffset={6}
                className={cn(
                    'oca-animate-fade z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg',
                    className
                )}
                {...props}
            >
                <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
    );
});

export const SelectItem = forwardRef<
    ElementRef<typeof SelectPrimitive.Item>,
    ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
    return (
        <SelectPrimitive.Item
            ref={ref}
            className={cn(
                'relative flex h-10 cursor-default select-none items-center rounded-lg pl-3 pr-9 text-[0.9375rem] outline-none',
                // The fill alone is 1.1:1 on the popover; the inset ring in --ring is what the eye finds.
                'data-[highlighted]:bg-accent data-[highlighted]:shadow-[inset_0_0_0_2px_var(--ring)] data-[disabled]:opacity-50',
                className
            )}
            {...props}
        >
            <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
            <SelectPrimitive.ItemIndicator className="absolute right-3">
                <Check className="size-4" />
            </SelectPrimitive.ItemIndicator>
        </SelectPrimitive.Item>
    );
});

/* ── Checkbox, Switch, Radio ──────────────────────────────────────────── */

export const Checkbox = forwardRef<
    ElementRef<typeof CheckboxPrimitive.Root>,
    ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
    return (
        <CheckboxPrimitive.Root
            ref={ref}
            className={cn(
                'peer inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border border-input bg-card',
                'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            {...props}
        >
            <CheckboxPrimitive.Indicator>
                <Check className="size-3.5" strokeWidth={3} />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    );
});

export const Switch = forwardRef<
    ElementRef<typeof SwitchPrimitive.Root>,
    ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
    return (
        <SwitchPrimitive.Root
            ref={ref}
            className={cn(
                'peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent bg-input p-0.5',
                'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                // The deep orange: the track is the state, so it must clear 3:1 on a card.
                'data-[state=checked]:bg-oca-orange-deep disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5" />
        </SwitchPrimitive.Root>
    );
});

export const RadioGroup = forwardRef<
    ElementRef<typeof RadioGroupPrimitive.Root>,
    ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(function RadioGroup({ className, ...props }, ref) {
    return <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-3', className)} {...props} />;
});

export const RadioGroupItem = forwardRef<
    ElementRef<typeof RadioGroupPrimitive.Item>,
    ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioGroupItem({ className, ...props }, ref) {
    return (
        <RadioGroupPrimitive.Item
            ref={ref}
            className={cn(
                'inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-input bg-card',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'data-[state=checked]:border-primary disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
            {...props}
        >
            <RadioGroupPrimitive.Indicator className="block size-2.5 rounded-full bg-primary" />
        </RadioGroupPrimitive.Item>
    );
});
