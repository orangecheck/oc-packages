import type { LucideIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../tokens/cn';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Button } from './button';

type AlertVariant = 'default' | 'destructive' | 'warning' | 'success';

export interface AlertWithActionProps {
    variant?: AlertVariant;
    icon?: LucideIcon;
    title?: string;
    description: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    actionVariant?: 'default' | 'outline' | 'ghost' | 'destructive';
    actionIcon?: React.ReactNode;
    actionDisabled?: boolean;
    actionContent?: React.ReactNode;
    className?: string;
}

/**
 * Alert with an integrated action button. Standard Alert styling + variants,
 * optional title/icon, optional action button or custom action content.
 */
export function AlertWithAction({
    variant = 'default',
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    actionVariant = 'outline',
    actionIcon,
    actionDisabled,
    actionContent,
    className,
}: AlertWithActionProps) {
    return (
        <Alert variant={variant} className={className}>
            {Icon && <Icon className="h-4 w-4" />}
            {title && <AlertTitle>{title}</AlertTitle>}
            <AlertDescription>
                {description}
                {(actionLabel || actionContent) && (
                    <div className="mt-3 flex items-center gap-2">
                        {actionContent}
                        {actionLabel && onAction && (
                            <Button
                                size="sm"
                                variant={actionVariant}
                                onClick={onAction}
                                disabled={actionDisabled}
                                className={cn(!actionContent && 'ml-auto')}
                            >
                                {actionIcon}
                                {actionLabel}
                            </Button>
                        )}
                    </div>
                )}
            </AlertDescription>
        </Alert>
    );
}

export interface AlertWithCountdownProps {
    variant?: AlertVariant;
    icon?: LucideIcon;
    title?: string;
    description: React.ReactNode;
    countdown: number;
    countdownLabel?: string;
    countdownIcon?: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
    actionIcon?: React.ReactNode;
    actionDisabled?: boolean;
    className?: string;
}

/**
 * Alert with a countdown timer and action button. Auto-pluralizes "second(s)"
 * and supports a `{countdown}` placeholder in `countdownLabel`.
 */
export function AlertWithCountdown({
    variant = 'default',
    icon: Icon,
    title,
    description,
    countdown,
    countdownLabel,
    countdownIcon,
    actionLabel = 'Check Now',
    onAction,
    actionIcon,
    actionDisabled,
    className,
}: AlertWithCountdownProps) {
    const label = countdownLabel
        ? countdownLabel.replace('{countdown}', countdown.toString())
        : `Rechecking in ${countdown} second${countdown !== 1 ? 's' : ''}...`;

    return (
        <Alert variant={variant} className={className}>
            {Icon && <Icon className="h-4 w-4" />}
            {title && <AlertTitle>{title}</AlertTitle>}
            <AlertDescription>
                {description}
                <div className="mt-3 flex items-center gap-2 text-sm">
                    {countdownIcon}
                    <span>{label}</span>
                    {onAction && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={onAction}
                            disabled={actionDisabled}
                            className="ml-auto"
                        >
                            {actionIcon}
                            {actionLabel}
                        </Button>
                    )}
                </div>
            </AlertDescription>
        </Alert>
    );
}
