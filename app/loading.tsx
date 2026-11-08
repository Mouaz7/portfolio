import RouteLoading from "@/components/ui/RouteLoading";

/**
 * Give App Router a real Suspense boundary so the URL commits immediately
 * while a dynamic server route is resolving. The completed page still owns
 * the existing approved presentation.
 */
export default function Loading() {
  return <RouteLoading />;
}
