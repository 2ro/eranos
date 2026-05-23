import type { NostrEvent } from "@nostrify/nostrify";
import { ExternalLink, FileText, Globe, Pin, PinOff, Server } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { ExternalFavicon } from "@/components/ExternalFavicon";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeedSettings } from "@/hooks/useFeedSettings";
import { useLinkPreview } from "@/hooks/useLinkPreview";
import { toast } from "@/hooks/useToast";
import { getNsiteSubdomain } from "@/lib/nsiteSubdomain";
import { sanitizeUrl } from "@/lib/sanitizeUrl";
import { cn } from "@/lib/utils";

interface NsiteCardProps {
	event: NostrEvent;
}

/** Renders an nsite deployment card with a rich link preview. */
export function NsiteCard({ event }: NsiteCardProps) {
	const title = event.tags.find(([n]) => n === "title")?.[1];
	const description = event.tags.find(([n]) => n === "description")?.[1];
	const dTag = event.tags.find(([n]) => n === "d")?.[1];
	const sourceUrl = sanitizeUrl(event.tags.find(([n]) => n === "source")?.[1]);
	const pathTags = event.tags.filter(([n]) => n === "path");
	const serverTags = event.tags.filter(([n]) => n === "server");

	const isNamed = event.kind === 35128 && !!dTag;
	const nsiteSubdomain = getNsiteSubdomain(event);
	const siteUrl = `https://${nsiteSubdomain}.nsite.lol`;
	const displayName = title || (isNamed ? dTag : "Root Site");

	const { addToSidebar, removeFromSidebar, orderedItems } = useFeedSettings();
	const sidebarUri = isNamed ? `nsite://${nsiteSubdomain}` : undefined;
	const isPinned = sidebarUri ? orderedItems.includes(sidebarUri) : false;

	const { data: preview, isLoading } = useLinkPreview(siteUrl);
	const image = preview?.thumbnail_url;
	const previewTitle = preview?.title;

	const handleTogglePin = useCallback(() => {
		if (!sidebarUri) return;
		if (isPinned) {
			removeFromSidebar(sidebarUri);
			toast({ title: 'Removed from sidebar' });
		} else {
			addToSidebar(sidebarUri);
			toast({ title: 'Added to sidebar' });
		}
	}, [sidebarUri, isPinned, addToSidebar, removeFromSidebar]);

	if (isLoading) {
		return <NsiteCardSkeleton />;
	}

	return (
		<div
			className={cn(
				"group mt-2 rounded-2xl border border-border overflow-hidden",
				"hover:bg-secondary/40 transition-colors",
			)}
			onClick={(e) => e.stopPropagation()}
		>
			{/* Link preview thumbnail — clicking navigates to the site */}
			<a
				href={siteUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="block"
				onClick={(e) => e.stopPropagation()}
			>
				{image && (
					<div className="w-full overflow-hidden bg-muted">
						<img
							src={image}
							alt=""
							className="w-full h-[180px] object-cover transition-transform duration-300 group-hover:scale-[1.02]"
							loading="lazy"
							onError={(e) => {
								(e.currentTarget.parentElement as HTMLElement).style.display = "none";
							}}
						/>
					</div>
				)}

				<div className="px-3.5 pt-2.5 pb-1.5 space-y-1.5">
					{/* Title with favicon */}
					<div className="flex items-center gap-2 min-w-0">
						<ExternalFavicon url={siteUrl} size={16} className="shrink-0" />
						<p className="text-sm font-semibold leading-snug line-clamp-2">
							{previewTitle || displayName}
						</p>
					</div>

					{/* Description — prefer event description (it's curated), fall back to OEmbed author */}
					{(description || preview?.author_name) && (
						<p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
							{description || preview?.author_name}
						</p>
					)}

					{/* Deployment stats */}
					{(pathTags.length > 0 || serverTags.length > 0) && (
						<div className="flex items-center gap-3 pt-0.5 text-[11px] text-muted-foreground">
							{pathTags.length > 0 && (
								<span className="inline-flex items-center gap-1">
									<FileText className="size-3" />
									{pathTags.length} {pathTags.length === 1 ? "file" : "files"}
								</span>
							)}
							{serverTags.length > 0 && (
								<span className="inline-flex items-center gap-1">
									<Server className="size-3" />
									{serverTags.length} {serverTags.length === 1 ? "server" : "servers"}
								</span>
							)}
						</div>
					)}
				</div>
			</a>

			{/* Action row */}
			<div className="px-3.5 pb-2.5 flex items-center gap-2">
				{sourceUrl ? (
					<Button asChild size="sm" variant="secondary" className="h-7 text-xs">
						<a
							href={sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.stopPropagation()}
						>
							<Globe className="size-3 mr-1" />
							Source
						</a>
					</Button>
				) : (
					<Button asChild size="sm" variant="secondary" className="h-7 text-xs">
						<a
							href={siteUrl}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.stopPropagation()}
						>
							<ExternalLink className="size-3 mr-1" />
							Visit
						</a>
					</Button>
				)}
				{sidebarUri && (
					<Button
						size="sm"
						variant="ghost"
						className="h-7 text-xs ml-auto text-muted-foreground"
						onClick={(e) => { e.stopPropagation(); handleTogglePin(); }}
					>
						{isPinned ? <PinOff className="size-3 mr-1" /> : <Pin className="size-3 mr-1" />}
						{isPinned ? 'Unpin' : 'Pin'}
					</Button>
				)}
			</div>
		</div>
	);
}

function NsiteCardSkeleton() {
	return (
		<div className="mt-2 rounded-2xl border border-border overflow-hidden">
			<Skeleton className="w-full h-[180px] rounded-none" />
			<div className="px-3.5 py-2.5 space-y-1.5">
				<Skeleton className="h-3 w-28" />
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-32" />
			</div>
		</div>
	);
}
