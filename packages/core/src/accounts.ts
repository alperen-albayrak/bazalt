export interface SavedAccount {
  /** Random UUID assigned at save time */
  id: string
  /** Server base URL, e.g. "https://bazalt.example.com" */
  serverUrl: string
  /** Email used to log in — display only */
  email: string
  /** JWT bearer token */
  token: string
}
