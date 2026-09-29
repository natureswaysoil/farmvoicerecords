export const stateResources: Record<
  string,
  { name: string; summary: string; url: string }
> = {
  nc: {
    name: "North Carolina",
    summary:
      "North Carolina publishes separate recordkeeping resources for agricultural, commercial and aerial applications. Start with the guidance for your applicator category; do not assume one deadline covers every application.",
    url: "https://www.ncagr.gov/divisions/structural-pest-control-and-pesticides/pesticide/ag-recordkeeping-requirements",
  },
  ga: {
    name: "Georgia",
    summary:
      "Georgia's contractor form covers both general-use and restricted-use pesticide applications by pesticide contractors. Private agricultural applicators should confirm which rules apply to their own operation.",
    url: "https://www.agr.georgia.gov/sites/default/files/documents/pest-control/contractors-pesticide-use-record-form.pdf",
  },
  fl: {
    name: "Florida",
    summary:
      "Florida's agricultural pesticide program distinguishes applicator categories and regulated uses. Confirm licensing and record requirements with FDACS, including worker-protection information for covered applications.",
    url: "https://www.fdacs.gov/Business-Services/Pesticide-Licensing",
  },
  ca: {
    name: "California",
    summary:
      "California requires detailed use reporting for nearly all agricultural pesticide uses and many nonagricultural uses. A saved FarmVoice record is not a submission to your county agricultural commissioner.",
    url: "https://www.cdpr.ca.gov/pesticide-use-in-california/pesticide-use-reporting/",
  },
};
