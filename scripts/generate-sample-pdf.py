"""Rebuild the fictional public sample. Requires reportlab and DejaVu fonts."""
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
pdfmetrics.registerFont(TTFont('DejaVu','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuBold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
styles=getSampleStyleSheet()
for style in styles.byName.values():
    style.fontName='DejaVuBold' if style.name in ['Title','Heading2'] else 'DejaVu'
styles['BodyText'].fontSize=10
styles['BodyText'].leading=15
parts=[Paragraph('FarmVoice Records',styles['Title']),Paragraph('SAMPLE ONLY - FICTIONAL APPLICATION',styles['Heading2']),Paragraph('Draft record for demonstration. Not a pesticide recommendation, legal certification, or completed inspection report.',styles['BodyText']),Spacer(1,18)]
rows=[['Field','Example value'],['Application date','September 20, 2026'],['Applicator','Alex Example'],['Certification number','MISSING - review required'],['Product','Example Product (fictional)'],['EPA registration number','MISSING - review required'],['Total amount applied','2 gallons'],['Crop / site','Corn'],['Location','North Field'],['Area treated','4 acres'],['Restricted-use classification','Not confirmed by user'],['Status','Draft - not confirmed']]
t=Table(rows,colWidths=[205,311]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#164b35')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,-1),'DejaVu'),('FONTNAME',(0,0),(-1,0),'DejaVuBold'),('FONTSIZE',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f1f6f2'),colors.white]),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#d0dcd3'))]))
parts+=[t,Spacer(1,18),Paragraph('Original note',styles['Heading2']),Paragraph('On September 20, 2026, Alex Example applied 2 gallons of Example Product to 4 acres of corn in North Field.',styles['BodyText']),Spacer(1,12),Paragraph('Review every field. Product labels, state rules and worker-protection requirements can require additional information. FarmVoice does not invent missing identifiers or legal confirmations.',styles['BodyText']),Spacer(1,16),Paragraph('farmvoicerecords.com/demo | Sample dated September 29, 2026',styles['BodyText'])]
SimpleDocTemplate('public/samples/pesticide-record.pdf',pagesize=(612,792),rightMargin=48,leftMargin=48,topMargin=40,bottomMargin=40).build(parts)
