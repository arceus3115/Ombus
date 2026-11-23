# Ombus

Ombus is a local intake prototype for Minnesota’s Long-Term Care, Mental Health and Developmental Disabilities, and Public Managed Health Care ombudsman offices.

## Run the intake

Start a loopback server from the project directory.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [the intake](http://127.0.0.1:8765) in a browser. Use fictional or de-identified information. The form keeps the draft in memory and downloads a JSON record after review. Agency submissions and persistent case storage require a separate integration.

The flow captures the shared concern, contact, and receipt information first. The county picker uses the 87 official Minnesota county names and codes. Contact and office steps put core questions first and reveal optional detail under **Have more info?** An optional issue selection suggests a route and can prefill the office’s issue field. Staff can choose or change the office and issue, including the staff-review route for uncertain or overlapping matters. [Minnesota County ID Standard](https://mn.gov/mngeo/assets/MN_GAC_County_ID_Standard_tcm1235-754089.pdf)

The versioned JSON record is Ombus’s internal format. It includes the selected office, applicable answers, and review flags. For an external handoff, map only the permitted fields to the approved channel for the selected office and workflow. Use the recipient’s official form or a staff-reviewed summary where appropriate. Use a JSON payload when the office provides an approved API and schema. Capture the acknowledgement or agency reference separately from the local record ID.

Run the intake model checks with `node --test`. See the [Minnesota workflow research](docs/minnesota-ombudsman-workflows.md) for the office responsibilities and underlying sources.
