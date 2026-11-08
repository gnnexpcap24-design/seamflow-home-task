import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = { message: string; title?: string; onRetry?: () => void };

export function ErrorAlert({ message, title = "Analysis failed", onRetry }: Props) {
  return (
    <Alert className="border-error-foreground/20 bg-error p-4 text-error-foreground">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="text-error-foreground">
        <p>{message}</p>
        {onRetry && (
          <Button variant="outline" className="mt-3 h-11 px-4" onClick={onRetry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
