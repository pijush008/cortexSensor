# Backend assets

Files the API itself needs at runtime, independent of the frontend bundle.

`cloudglance-mark.png` is the company mark, seeded as the logo of the operator
organization the first time a platform operator creates a project. It is a COPY
of `frontend/public/brand/cloudglance-mark.png` rather than a reference: the
backend and frontend are separately deployable, and a runtime path reaching into
the other's bundle breaks the moment they are.
