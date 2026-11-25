# Ombus routing coverage

Regenerate with `go run ./cmd/ombus -coverage=markdown`. Use `-coverage=json` for contact URLs, sources, additional topics, and the destinations for each follow-up answer.

**Office** means Ombus has a published contact for the matched office. **Directory** means a program directory can find the local contact. **Question** means one answer is needed to distinguish offices. **Resource** means the case goes to staff review with a published public resource. **Review** means staff review alone. A specific intake may require staff review if the answers leave its jurisdiction uncertain.

| Jurisdiction | Long-term care | Care facility notice | Mental health or disability | Medicaid | Child welfare | Public education | Corrections | State government |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Alabama (AL) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Alaska (AK) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Office |
| Arizona (AZ) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Office |
| Arkansas (AR) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| California (CA) | Office + 58 county contacts | Office + 58 county contacts | Resource | Office | Office | Resource | Resource | Resource |
| Colorado (CO) | Directory | Directory | Resource | Resource | Office | Resource | Resource | Resource |
| Connecticut (CT) | Directory | Directory | Resource | Resource | Resource | Resource | Office | Resource |
| Delaware (DE) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| District of Columbia (DC) | Directory | Directory | Resource | Resource | Resource | Office | Resource | Resource |
| Florida (FL) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Georgia (GA) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Guam (GU) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Hawaii (HI) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Office |
| Idaho (ID) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Illinois (IL) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Indiana (IN) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Iowa (IA) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Office |
| Kansas (KS) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Kentucky (KY) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Louisiana (LA) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Maine (ME) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Maryland (MD) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Massachusetts (MA) | Directory | Directory | Resource | Resource | Office | Resource | Resource | Resource |
| Michigan (MI) | Directory | Directory | Resource | Resource | Office | Resource | Office | Resource |
| Minnesota (MN) | Office | Office | Office | Office | Question | Resource | Office | Resource |
| Mississippi (MS) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Missouri (MO) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Montana (MT) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Nebraska (NE) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Office |
| Nevada (NV) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| New Hampshire (NH) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| New Jersey (NJ) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| New Mexico (NM) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| New York (NY) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| North Carolina (NC) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| North Dakota (ND) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Ohio (OH) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Oklahoma (OK) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Oregon (OR) | Directory | Directory | Office | Office | Office | Resource | Resource | Resource |
| Pennsylvania (PA) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Puerto Rico (PR) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Rhode Island (RI) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| South Carolina (SC) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| South Dakota (SD) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Tennessee (TN) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Texas (TX) | Office | Office | Question | Office | Office | Resource | Resource | Resource |
| Utah (UT) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Vermont (VT) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Virginia (VA) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Washington (WA) | Office | Office | Resource | Resource | Office | Office | Office | Resource |
| West Virginia (WV) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
| Wisconsin (WI) | Office | Office | Resource | Resource | Resource | Resource | Resource | Resource |
| Wyoming (WY) | Directory | Directory | Resource | Resource | Resource | Resource | Resource | Resource |
