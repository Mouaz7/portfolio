/** A portfolio project as stored in the database and shown on /projects. */
export interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  github_url: string;
  languages: string[];
  cover_image_url?: string;
  visibility: "public" | "private";
}
