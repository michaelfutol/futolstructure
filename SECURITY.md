# Security Policy

## Supported Version

Security fixes are applied to the latest code on the default branch and the
current production deployment. Historical archives and generated solver files
are not supported runtime releases.

## Reporting a Vulnerability

Please use GitHub private vulnerability reporting for this repository:

https://github.com/michaelfutol/futolstructure/security/advisories/new

Do not disclose API keys, private `.fstr` project files, solver models, client
names, or exploit details in a public issue. If private reporting is
temporarily unavailable, open a public issue containing only a request for a
private contact channel.

Include the affected URL or revision, reproduction steps, expected impact,
and any safe proof-of-concept material. Reports will be acknowledged as soon
as practical and triaged according to impact and reproducibility.

## Current Data Boundary

The public technical preview is a static, local-file-first application. It has
no production user database or cloud project store. Experimental client-side
AI key panels are disabled in the public release. Authentication and cloud
storage must not be enabled until server-side authorization and row-level
database policies are in place.
