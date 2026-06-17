export interface LocalOneNotePage {
  id: string;
  title: string;
  sectionId: string;
  content?: string;
  createdTime?: string;
  lastModifiedTime?: string;
}

export interface LocalOneNoteSection {
  id: string;
  name: string;
  notebookId: string;
  pages?: LocalOneNotePage[];
}

export interface LocalOneNoteNotebook {
  id: string;
  name: string;
  path?: string;
  sections?: LocalOneNoteSection[];
}
