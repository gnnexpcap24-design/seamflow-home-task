import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = { title: string; text: string };

export function UpsellCard({ title, text }: Props) {
  return (
    <Card className="mx-auto w-full max-w-lg [--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{text}</p>
        <Link href="/pricing" className={cn(buttonVariants(), "h-11 w-fit px-5")}>
          View plans
        </Link>
      </CardContent>
    </Card>
  );
}
